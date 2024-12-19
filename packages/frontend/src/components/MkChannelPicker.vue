<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModal ref="modal" v-slot="{ type }" :zPriority="'high'" :src="src" @click="modal?.close()" @closed="emit('closed')">
	<div class="_popup" :class="{ [$style.root]: true, [$style.asDrawer]: type === 'drawer' }">
		<div :class="[$style.label, $style.item]">
			{{ i18n.ts.channel }}
		</div>
		<div v-for="channel in channels" :key="channel.id">
			<button class="_button" :class="[$style.item, { [$style.active]: v?.id === channel.id }]" @click="choose(channel)">
				<div :class="$style.icon" class="ti ti-device-tv"></div>
				<div :class="$style.body">
					<span :class="$style.itemTitle">{{ channel.name }}</span>
					<span :class="$style.itemDescription">{{ channel.description }}</span>
				</div>
			</button>
		</div>
		<button class="_button" :class="[$style.item, { [$style.active]: v === null }]" @click="choose(null)">
			<div :class="$style.icon"><i class="ti ti-device-tv-off"></i></div>
			<div :class="$style.body">
				<span :class="$style.itemTitle">{{ i18n.ts.none }}</span>
			</div>
		</button>
	</div>
</MkModal>
</template>

<script lang="ts" setup>
import { nextTick, shallowRef, ref, onMounted } from 'vue';
import * as Misskey from 'misskey-js';
import MkModal from '@/components/MkModal.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/scripts/misskey-api.js';

const modal = shallowRef<InstanceType<typeof MkModal>>();

const props = withDefaults(defineProps<{
	currentChannel?: Misskey.entities.Channel;
	src?: HTMLElement;
}>(), {
});

const emit = defineEmits<{
	(ev: 'changeChannel', v: Misskey.entities.Channel | null): void;
	(ev: 'closed'): void;
}>();

const v = ref<Misskey.entities.Channel | null>(props.currentChannel ?? null);
const channels = ref<Misskey.entities.Channel[]>([]);

function choose(channel: Misskey.entities.Channel | null): void {
	v.value = channel;
	emit('changeChannel', channel);
	nextTick(() => {
		if (modal.value) modal.value.close();
	});
}

onMounted(async () => {
	channels.value = await misskeyApi('channels/my-favorites', {});
});
</script>

<style lang="scss" module>
.root {
	min-width: 240px;
	padding: 8px 0;

	&.asDrawer {
		padding: 12px 0 max(env(safe-area-inset-bottom, 0px), 12px) 0;
		width: 100%;
		border-radius: 24px;
		border-bottom-right-radius: 0;
		border-bottom-left-radius: 0;

		.label {
			pointer-events: none;
			font-size: 12px;
			padding-bottom: 4px;
			opacity: 0.7;
		}

		.item {
			font-size: 14px;
			padding: 10px 24px;
		}
	}
}

.label {
	pointer-events: none;
	font-size: 10px;
	padding-bottom: 4px;
	opacity: 0.7;
}

.item {
	display: flex;
	padding: 8px 14px;
	font-size: 12px;
	text-align: left;
	width: 100%;
	box-sizing: border-box;

	&:hover {
		background: rgba(0, 0, 0, 0.05);
	}

	&:active {
		background: rgba(0, 0, 0, 0.1);
	}

	&.active {
		color: var(--accent);
	}
}

.icon {
	display: flex;
	justify-content: center;
	align-items: center;
	margin-right: 10px;
	width: 16px;
	top: 0;
	bottom: 0;
	margin-top: auto;
	margin-bottom: auto;
}

.body {
	flex: 1 1 auto;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.itemTitle {
	display: block;
	font-weight: bold;
}

.itemDescription {
	opacity: 0.6;
}
</style>
