<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer>
	<template #header><MkPageHeader v-model:tab="src" :actions="headerActions" :tabs="headerTabs" :displayMyAvatar="true"/></template>
	<MkSpacer :contentMax="800">
		<MkHorizontalSwipe v-model:tab="src" :tabs="headerTabs">
			<div :key="src" ref="rootEl" v-hotkey.global="keymap">
				<MkInfo v-if="['local', 'social'].includes(src) && !defaultStore.reactiveState.timelineTutorials.value[src]" style="margin-bottom: var(--margin);" closable @close="closeTutorial()">
					{{ i18n.ts._timelineDescription[src] }}
				</MkInfo>
				<MkPostForm v-if="defaultStore.reactiveState.showFixedPostForm.value" :key="currentChannel" :class="$style.postForm" class="post-form _panel" fixed style="margin-bottom: var(--margin);"/>
				<div v-if="queue > 0" :class="$style.new"><button class="_buttonPrimary" :class="$style.newButton" @click="top()">{{ i18n.ts.newNoteRecived }}</button></div>
				<div :class="$style.tl">
					<MkTimeline
						ref="tlComponent"
						:key="src + withRenotes + withReplies + onlyFiles"
						:src="src.split(':')[0] === 'recommended' ? 'channel' : src"
						:channel="src.split(':')[1]"
						:withRenotes="withRenotes"
						:withReplies="withReplies"
						:onlyFiles="onlyFiles"
						:sound="true"
						@queue="queueUpdated"
					/>
				</div>
			</div>
		</MkHorizontalSwipe>
	</MkSpacer>
</MkStickyContainer>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, provide, ref, shallowRef, watch, watchEffect } from 'vue';
import type { Tab } from '@/components/global/MkPageHeader.tabs.vue';
import MkTimeline from '@/components/MkTimeline.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkPostForm from '@/components/MkPostForm.vue';
import MkHorizontalSwipe from '@/components/MkHorizontalSwipe.vue';
import { scroll } from '@/scripts/scroll.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/scripts/misskey-api.js';
import { defaultStore } from '@/store.js';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';
import { $i } from '@/account.js';
import { definePageMetadata } from '@/scripts/page-metadata.js';
import { deviceKind } from '@/scripts/device-kind.js';
import { deepMerge } from '@/scripts/merge.js';
import * as Misskey from 'misskey-js';

provide('shouldOmitHeaderTitle', true);

const isLocalTimelineAvailable = ($i == null && instance.policies.ltlAvailable) || ($i != null && $i.policies.ltlAvailable);

const keymap = {
	't': focus,
};

const tlComponent = shallowRef<InstanceType<typeof MkTimeline>>();
const rootEl = shallowRef<HTMLElement>();

const queue = ref(0);
const src = computed<'local' | 'social' | `recommended:${string}`>({
	get: () => (defaultStore.reactiveState.selectedRecommendedTab.value),
	set: (x) => saveSrc(x),
});
const withRenotes = computed<boolean>({
	get: () => defaultStore.reactiveState.tl.value.filter.withRenotes,
	set: (x) => saveTlFilter('withRenotes', x),
});
const currentChannel = ref<Misskey.entities.Channel | null>();
const recommendedChannels = ref<Misskey.entities.Channel[]>([]);
const channelTabs = ref<Tab[]>([]);

// computed内での無限ループを防ぐためのフラグ
const localSocialTLFilterSwitchStore = ref<'withReplies' | 'onlyFiles' | false>('withReplies');

const withReplies = computed<boolean>({
	get: () => {
		if (!$i) return false;
		if (['local', 'social'].includes(src.value) && localSocialTLFilterSwitchStore.value === 'onlyFiles') {
			return false;
		} else {
			return defaultStore.reactiveState.tl.value.filter.withReplies;
		}
	},
	set: (x) => saveTlFilter('withReplies', x),
});
const onlyFiles = computed<boolean>({
	get: () => {
		if (['local', 'social'].includes(src.value) && localSocialTLFilterSwitchStore.value === 'withReplies') {
			return false;
		} else {
			return defaultStore.reactiveState.tl.value.filter.onlyFiles;
		}
	},
	set: (x) => saveTlFilter('onlyFiles', x),
});

watch([withReplies, onlyFiles], ([withRepliesTo, onlyFilesTo]) => {
	if (withRepliesTo) {
		localSocialTLFilterSwitchStore.value = 'withReplies';
	} else if (onlyFilesTo) {
		localSocialTLFilterSwitchStore.value = 'onlyFiles';
	} else {
		localSocialTLFilterSwitchStore.value = false;
	}
});

const withSensitive = computed<boolean>({
	get: () => defaultStore.reactiveState.tl.value.filter.withSensitive,
	set: (x) => saveTlFilter('withSensitive', x),
});

const withAiGenerated = computed<boolean>({
	get: () => defaultStore.reactiveState.tl.value.filter.withAiGenerated,
	set: (x) => saveTlFilter('withAiGenerated', x),
});

watch(src, () => {
	queue.value = 0;

	if (src.value.split(':')[1]) {
		currentChannel.value = recommendedChannels.value.find(c => c.id === src.value.split(':')[1]);
	} else {
		currentChannel.value = null;
		defaultStore.set('postFormTarget', null);
	}
});

watch(currentChannel, () => {
	if (currentChannel.value) {
		defaultStore.set('postFormTarget', currentChannel.value);
	} else {
		defaultStore.set('postFormTarget', null);
	}
});

watch([withSensitive, withAiGenerated], () => {
	// これだけはクライアント側で完結する処理なので手動でリロード
	tlComponent.value?.reloadTimeline();
});

function queueUpdated(q: number): void {
	queue.value = q;
}

function top(): void {
	if (rootEl.value) scroll(rootEl.value, { top: 0 });
}

function saveSrc(newSrc: 'local' | 'social' | `recommended:${string}`): void {
	defaultStore.set('selectedRecommendedTab', newSrc);
}

function saveTlFilter(key: keyof typeof defaultStore.state.tl.filter, newValue: boolean) {
	if (key !== 'withReplies' || $i) {
		const out = deepMerge({ filter: { [key]: newValue } }, defaultStore.state.tl);
		defaultStore.set('tl', out);
	}
}

function focus(): void {
	tlComponent.value.focus();
}

function closeTutorial(): void {
	if (!['home', 'local', 'social', 'global'].includes(src.value)) return;
	const before = defaultStore.state.timelineTutorials;
	before[src.value] = true;
	defaultStore.set('timelineTutorials', before);
}

onMounted(async () => {
	misskeyApi('channels/recommended').then(result => {
		recommendedChannels.value = result;

		for (const channel of recommendedChannels.value) {
			channelTabs.value.push({
				key: `recommended:${channel.id}`,
				title: channel.name,
				icon: 'ti ti-device-tv',
				iconOnly: false,
			});
		}

		if (src.value.split(':')[1]) {
			currentChannel.value = recommendedChannels.value.find(c => c.id === src.value.split(':')[1]);
		}
	});
});

onUnmounted(() => {
	defaultStore.set('postFormTarget', null);
});

const headerActions = computed(() => {
	const tmp = [
		{
			icon: 'ti ti-dots',
			text: i18n.ts.options,
			handler: (ev) => {
				os.popupMenu([{
					type: 'switch',
					text: i18n.ts.showRenotes,
					ref: withRenotes,
				}, src.value === 'local' || src.value === 'social' ? {
					type: 'switch',
					text: i18n.ts.showRepliesToOthersInTimeline,
					ref: withReplies,
					disabled: onlyFiles,
				} : undefined, {
					type: 'switch',
					text: i18n.ts.withSensitive,
					ref: withSensitive,
				}, {
					type: 'switch',
					text: i18n.ts.withAiGenerated,
					ref: withAiGenerated,
				}, {
					type: 'switch',
					text: i18n.ts.fileAttachedOnly,
					ref: onlyFiles,
					disabled: src.value === 'local' || src.value === 'social' ? withReplies : false,
				}], ev.currentTarget ?? ev.target);
			},
		},
	];
	if (deviceKind === 'desktop') {
		tmp.unshift({
			icon: 'ti ti-refresh',
			text: i18n.ts.reload,
			handler: (ev: Event) => {
				tlComponent.value?.reloadTimeline();
			},
		});
	}
	return tmp;
});

const headerTabs = computed(() => [
	...(isLocalTimelineAvailable ? [{
		key: 'local',
		title: i18n.ts._timelines.local,
		icon: 'ti ti-planet',
		iconOnly: true,
	}, {
		key: 'social',
		title: i18n.ts._timelines.social,
		icon: 'ti ti-universe',
		iconOnly: true,
	}] : []),
	...channelTabs.value,
]);

definePageMetadata(() => ({
	title: i18n.ts.timeline,
	icon: src.value === 'local' ? 'ti ti-planet' : src.value === 'social' ? 'ti ti-universe' : src.value.startsWith('recommended') ? 'ti ti-bolt' : 'ti ti-home',
}));
</script>

<style lang="scss" module>
.new {
	position: sticky;
	top: calc(var(--stickyTop, 0px) + 16px);
	z-index: 1000;
	width: 100%;
	margin: calc(-0.675em - 8px) 0;

	&:first-child {
		margin-top: calc(-0.675em - 8px - var(--margin));
	}
}

.newButton {
	display: block;
	margin: var(--margin) auto 0 auto;
	padding: 8px 16px;
	border-radius: 32px;
}

.postForm {
	border-radius: var(--radius);
}

.tl {
	background: var(--bg);
	border-radius: var(--radius);
	overflow: clip;
}
</style>
