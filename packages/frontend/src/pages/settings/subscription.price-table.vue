<template>
<div>
	<div ref="pricingTableContainer"></div>
</div>
</template>

<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import { instance } from '@/instance.js';

const props = defineProps<{
	clientSecret: string;
}>();

const pricingTableContainer = ref<HTMLElement | null>(null);

const stripeLibrarySrc = 'https://js.stripe.com/v3/pricing-table.js';
const scriptId = 'pricing-table';

// Stripe公開可能キーと料金表ID
const publishableKey = instance.stripePublishableKey;
const pricingTableId = instance.subscriptionPricingTable;

onMounted(() => {
	if (document.getElementById(scriptId)) {
		// すでにStripe.jsが読み込まれていれば初期化
		initializeStripe();
	} else {
		// 動的に外部スクリプトを読み込む
		const script = document.createElement('script');
		script.id = scriptId;
		script.src = stripeLibrarySrc;
		script.async = true;
		script.onload = () => initializeStripe();
		document.head.appendChild(script);
	}
});

function initializeStripe() {
	console.info('Initialize Stripe.js');

	const StripePricingTable = window.customElements.get('stripe-pricing-table')!;
	const stripePricingTable = new StripePricingTable();
	stripePricingTable.setAttribute('publishable-key', publishableKey);
	stripePricingTable.setAttribute('pricing-table-id', pricingTableId);
	if (props.clientSecret) {
		stripePricingTable.setAttribute('customer-session-client-secret', props.clientSecret);
	}

	pricingTableContainer.value?.appendChild(stripePricingTable);
}
</script>

<style scoped>
div {
	margin-top: 16px;
}
</style>
