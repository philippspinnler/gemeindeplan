<script lang="ts">
	import ChangeList from '$lib/components/ChangeList.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Änderungen</title></svelte:head>

<h1>Änderungen</h1>
<p class="hint">Wer was geändert hat, in den Bereichen, die du bearbeiten darfst. Einträge werden nach 90 Tagen gelöscht.</p>

<form class="filters" method="GET" data-sveltekit-keepfocus>
	<label>
		Person
		<select name="person" onchange={(e) => e.currentTarget.form?.requestSubmit()}>
			<option value="">Alle</option>
			{#each data.people as p (p.id)}<option value={p.id} selected={p.id === data.person}>{p.name}</option>{/each}
		</select>
	</label>
	<label>
		Bereich
		<select name="bereich" onchange={(e) => e.currentTarget.form?.requestSubmit()}>
			<option value="">Alle</option>
			{#each data.areas as a (a)}<option value={a} selected={a === data.area}>{a}</option>{/each}
		</select>
	</label>
	<noscript><button class="btn btn-small" type="submit">Filtern</button></noscript>
</form>

<div class="section">
	<ChangeList changes={data.changes} showTarget />
</div>

<style>
	.filters { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1rem; }
	.filters label { display: flex; flex-direction: column; gap: 0.3rem; font-weight: 600; font-size: 0.95rem; min-width: 12rem; }
</style>
