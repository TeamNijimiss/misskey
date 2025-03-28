<template>
<div class="_gaps_m">
	<MkButton v-if="$i && !$i.stripeCustomerId" primary large @click="linkStripeAccount">{{ i18n.ts._subscription.linkAccount }}</MkButton>
	<div v-else class="_gaps_s">
		<MkKeyValue>
			<template #key>{{ i18n.ts.subscriptionStatus }}</template>
			<template #value>{{ i18n.t(`_subscription.${subscriptionStatus}`) }}</template>
		</MkKeyValue>
		<MkButton primary large @click="resyncSubscriptionStatus">{{ i18n.ts._subscription.resyncStatus }}</MkButton>
	</div>
	<XPricingTable v-if="clientSecret && (subscriptionStatus === 'none' || subscriptionStatus === 'canceled')" :clientSecret="clientSecret.client_secret"/>
	<MkButton v-else primary large @click="manage">{{ i18n.ts._subscription.manage }}</MkButton>
</div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import XPricingTable from './subscription.price-table.vue';
import { i18n } from '@/i18n.js';
import { $i } from '@/account.js';
import MkKeyValue from '@/components/MkKeyValue.vue';
import { definePageMetadata } from '@/scripts/page-metadata.js';
import { misskeyApi } from '@/scripts/misskey-api';
import MkButton from '@/components/MkButton.vue';
import * as os from '@/os';
import { unisonReload } from '@/scripts/unison-reload';

const subscriptionStatus = computed(() => $i.subscriptionStatus);
const clientSecret = ref();

async function fetch() {
	if ($i && $i.stripeCustomerId) {
		clientSecret.value = await misskeyApi('i/stripe/get-client-secret');
	}
}

fetch();

function linkStripeAccount() {
	os.apiWithDialog('i/stripe/link-account').then(() => {
		unisonReload();
	});
}

function resyncSubscriptionStatus() {
	os.apiWithDialog('i/stripe/resync-subscription-status').then(() => {
		unisonReload();
	});
}

async function manage() {
	const redirect = await os.apiWithDialog('i/stripe/billing-dashboard');
	if (redirect) {
		location.href = redirect.redirect.destination;
	}
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePageMetadata({
	title: i18n.ts.subscription,
	icon: 'ti ti-credit-card',
});
</script>

<style lang="scss" module>
.plan {
	display: flex;
	padding: 16px;
}

.planName {
	font-weight: bold;
}

.planBody {
	width: calc(100% - 62px);
	position: relative;
}

.button {
	margin: 8px 0;
}
</style>
