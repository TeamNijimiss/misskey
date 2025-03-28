<!--
SPDX-FileCopyrightText: syuilo and other misskey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer>
	<template #header><MkPageHeader v-model:tab="tab" :actions="headerActions" :tabs="headerTabs"/></template>
	<MkSpacer :contentMax="900">
		<div class="_gaps">
			<MkSwitch v-model="enableSubscription" @update:modelValue="enableSubscriptionChanged">
				<template #label>{{ i18n.ts.enable }}</template>
			</MkSwitch>
			<MkInput v-model="subscriptionPricingTableId" :label="i18n.ts._subscription.subscriptionPricingTable"/>
			<MkButton primary @click="updateSubscriptionPricingTable">{{ i18n.ts.update }}</MkButton>
		</div>
	</MkSpacer>
</MkStickyContainer>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import { misskeyApi } from '@/scripts/misskey-api.js';
import { i18n } from '@/i18n.js';
import { definePageMetadata } from '@/scripts/page-metadata.js';
import MkSwitch from '@/components/MkSwitch.vue';
import MkInput from '@/components/MkInput.vue';
import MkButton from '@/components/MkButton.vue';

const enableSubscription = ref(false);
const subscriptionPricingTableId = ref(null);

function enableSubscriptionChanged() {
	misskeyApi('admin/update-meta', { enableSubscriptions: enableSubscription.value });
}

function updateSubscriptionPricingTable() {
	misskeyApi('admin/update-meta', { subscriptionPricingTable: subscriptionPricingTableId.value });
}

function load() {
	misskeyApi('admin/meta').then(meta => {
		enableSubscription.value = meta.enableSubscriptions;
		subscriptionPricingTableId.value = meta.subscriptionPricingTable;
	});
}

load();

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePageMetadata({
	title: i18n.ts.subscription,
	icon: 'ti ti-credit-card',
});
</script>
