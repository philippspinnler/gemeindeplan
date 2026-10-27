<script lang="ts">
	import SortHeader from '$lib/components/SortHeader.svelte';
	import { sortHymns, type HymnSortState } from '$lib/hymn-sort';
	let { data, form } = $props();
	let q = $state('');
	let showForm = $state(false);
	let sort = $state<HymnSortState>({ key: 'number', dir: 'asc' });
	const onsort = (s: HymnSortState) => (sort = s);
	const filtered = $derived(
		sortHymns(
			data.hymns.filter((h) => !q || String(h.number).startsWith(q.trim()) || h.title.toLowerCase().includes(q.trim().toLowerCase())),
			sort
		)
	);
</script>

<div class="section-title">
	<h1>Lieder</h1>
	{#if data.canEdit}<button class="btn btn-primary" type="button" onclick={() => (showForm = !showForm)}>Lied hinzufügen</button>{/if}
</div>
{#if form?.error}<div class="error">{form.error}</div>{/if}

{#if showForm}
	<div class="section">
		<form method="POST" action="?/create" class="grid-3">
			<div class="field"><label for="nr">Nummer</label><input id="nr" name="number" type="number" min="1" required /></div>
			<div class="field"><label for="ti">Titel</label><input id="ti" name="title" type="text" required /></div>
			<div class="field"><label for="du">Dauer (m:ss, optional)</label><input id="du" name="duration" type="text" placeholder="z.B. 3:45" /></div>
			<div class="actions"><button class="btn btn-primary" type="submit">Anlegen</button></div>
		</form>
		<p class="hint">Nummern ab 1001 gehören zum neuen Liederbuch.</p>
	</div>
{/if}

<div class="section">
	<div class="field"><label for="q">Suchen (Nummer oder Titel)</label><input id="q" type="text" bind:value={q} placeholder="z.B. 56 oder Felsen" /></div>
	<div class="table-wrap">
		<table class="table stack">
			<thead>
				<tr>
					<SortHeader key="number" label="Nr." {sort} {onsort} />
					<SortHeader key="title" label="Titel" {sort} {onsort} />
					<SortHeader key="duration" label="Dauer" {sort} {onsort} />
					<SortHeader key="lastSung" label="Zuletzt" {sort} {onsort} />
					<SortHeader key="count52" label="Letzte 52 Wochen" {sort} {onsort} />
				</tr>
			</thead>
			<tbody>
				{#each filtered as h (h.number)}
					<tr>
						<td class="td-main td-inline"><a href="/lieder/{h.number}">{h.number}</a></td>
						<td class="td-main td-inline"><a href="/lieder/{h.number}">{h.title}</a></td>
						<td data-label={h.duration ? 'Dauer' : null}>{h.duration}</td>
						<td data-label="Zuletzt">{h.lastSung}</td>
						<td data-label="52 Wochen">{h.count52}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
