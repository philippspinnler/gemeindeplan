<script lang="ts">
	import { goto } from '$app/navigation';
	import SortHeader from '$lib/components/SortHeader.svelte';
	import { sortMembers, type MemberSortState } from '$lib/member-sort';
	let { data, form } = $props();
	let showForm = $state(false);
	let sort = $state<MemberSortState>({ key: 'name', dir: 'asc' });
	const sorted = $derived(sortMembers(data.members, sort));
	const onsort = (s: MemberSortState) => (sort = s);
</script>

<div class="section-title">
	<h2>Mitglieder</h2>
	<div class="actions">
		<a class="btn" href={data.showAll ? '/einstellungen/mitglieder' : '/einstellungen/mitglieder?alle=1'}>{data.showAll ? 'Nur auswählbare' : 'Alle anzeigen'}</a>
		{#if data.canCreate}<button class="btn btn-primary" type="button" onclick={() => (showForm = !showForm)}>Mitglied hinzufügen</button>{/if}
	</div>
</div>
<p class="hint">Gemeindemitglieder für Ansprachen und Gebete. Ausgeblendete Mitglieder erscheinen in keiner Auswahlliste, zum Beispiel Kinder oder Weggezogene.</p>

{#if form?.error}<div class="error">{form.error}</div>{/if}

{#if showForm}
	<div class="section">
		<form method="POST" action="?/create" class="grid-3">
			<div class="field"><label for="fn">Vorname</label><input id="fn" name="firstName" type="text" required /></div>
			<div class="field"><label for="ln">Nachname (optional)</label><input id="ln" name="lastName" type="text" /></div>
			<div class="field"><label for="af">Bemerkung (optional, erscheint in Klammern)</label><input id="af" name="affiliation" type="text" placeholder="z.B. Missionar" /></div>
			<div class="actions"><button class="btn btn-primary" type="submit">Hinzufügen</button></div>
		</form>
	</div>
{/if}

<div class="section table-wrap">
	<table class="table stack">
		<thead>
			<tr>
				<SortHeader key="name" label="Name" {sort} {onsort} />
				{#if data.stats}
					<SortHeader key="lastTalk" label="Letzte Ansprache" {sort} {onsort} />
					<SortHeader key="lastPrayer" label="Letztes Gebet" {sort} {onsort} />
				{/if}
				{#if data.showAll}<SortHeader key="status" label="Status" {sort} {onsort} />{/if}
			</tr>
		</thead>
		<tbody>
			{#each sorted as m (m.id)}
				<tr class="clickable" onclick={() => goto(`/mitglieder/${m.id}`)}>
					<td class="td-main"><a href="/mitglieder/{m.id}">{m.name}</a></td>
					{#if data.stats}
						<td data-label="Letzte Ansprache"><span class:muted={m.noTalk}>{m.lastTalk}</span>{#if m.noteTalk}<span class="cell-note">{m.noteTalk}</span>{/if}</td>
						<td data-label="Letztes Gebet"><span class:muted={m.noPrayer}>{m.lastPrayer}</span>{#if m.notePrayer}<span class="cell-note">{m.notePrayer}</span>{/if}</td>
					{/if}
					{#if data.showAll}<td data-label="Status">{m.active ? 'auswählbar' : 'ausgeblendet'}</td>{/if}
				</tr>
			{/each}
		</tbody>
	</table>
</div>
