<script lang="ts">
	import YouthItem from '$lib/components/YouthItem.svelte';
	import CalendarSubscribe from './CalendarSubscribe.svelte';
	let { data } = $props();
</script>

<svelte:head>
	<title>JD / JM {data.ward}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main>
	{#if data.notices.length}
		<div class="list notices">{#each data.notices as ev (ev.date)}<YouthItem {ev} compact stacked />{/each}</div>
	{/if}
	<div class="cards">
		{#each data.big as ev (ev.date)}<YouthItem {ev} />{/each}
	</div>
	{#if data.small.length}
		<section class="list">
			<h2>Danach</h2>
			{#each data.small as ev (ev.date + ev.weekday)}<YouthItem {ev} compact />{/each}
		</section>
	{/if}
	{#if data.calendar}<CalendarSubscribe {...data.calendar} />{/if}
</main>

<style>
	main { max-width: 900px; margin: 0 auto; padding: 14px; }
	.cards { display: grid; gap: 12px; margin-bottom: 12px; }
	.list { background: var(--surface); border-radius: var(--radius); padding: 0.4rem 0.6rem; box-shadow: 0 1px 2px rgb(0 0 0 / 0.06); margin-bottom: 12px; }
	.list h2 { font-size: 1.1rem; margin: 0.5rem 0.6rem 0.6rem; }
	.notices { padding: 0; overflow: hidden; }
	@media (min-width: 720px) {
		main { padding: 24px; }
		.cards { grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
	}
</style>
