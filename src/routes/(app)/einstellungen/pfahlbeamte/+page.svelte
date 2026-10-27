<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	let { data, form } = $props();
	let showForm = $state(false);
	const submitOnChange = (e: Event) => (e.currentTarget as HTMLInputElement).form?.requestSubmit();
</script>

<div class="section-title">
	<h2>Pfahlbeamte</h2>
	<div class="actions">
		<a class="btn" href={data.showAll ? '/einstellungen/pfahlbeamte' : '/einstellungen/pfahlbeamte?alle=1'}>{data.showAll ? 'Nur auswählbare' : 'Alle anzeigen'}</a>
		{#if data.canCreate}<button class="btn btn-primary" type="button" onclick={() => (showForm = !showForm)}>Pfahlbeamten hinzufügen</button>{/if}
	</div>
</div>
<p class="hint">Pfahlbeamte stehen nur bei den Ansprachen zur Auswahl.</p>

{#if form?.error}<div class="error">{form.error}</div>{/if}
{#if form?.saved}<div class="success">Gespeichert.</div>{/if}

<details class="section">
	<summary><h2>Berufungen verwalten</h2></summary>
	<p class="hint">Berufungen für Pfahlbeamte, angezeigt in Klammern hinter dem Namen. Gäste mit Häkchen "Vorsitz" übernehmen den Vorsitz.</p>
	<ul class="row-list">
		{#each data.callings as c, i}
			<li>
				<form method="POST" action="?/renameCalling" use:enhance class="actions" style="flex: 1; margin: 0">
					<input type="hidden" name="id" value={c.id} />
					<input type="text" name="name" value={c.name} required style="flex: 1" aria-label="Name der Berufung" onchange={submitOnChange} />
				</form>
				<form method="POST" action="?/presidesCalling" use:enhance>
					<input type="hidden" name="id" value={c.id} />
					<label class="check"><input type="checkbox" name="presides" value="1" checked={c.presides} onchange={submitOnChange} /> Vorsitz</label>
				</form>
				<form method="POST" action="?/moveCalling" use:enhance>
					<input type="hidden" name="id" value={c.id} />
					<button class="btn btn-small" type="submit" name="dir" value="up" disabled={i === 0} aria-label="nach oben">↑</button>
					<button class="btn btn-small" type="submit" name="dir" value="down" disabled={i === data.callings.length - 1} aria-label="nach unten">↓</button>
				</form>
				<form method="POST" action="?/deleteCalling" use:enhance>
					<input type="hidden" name="id" value={c.id} />
					<button class="btn btn-small btn-danger" type="submit">Löschen</button>
				</form>
			</li>
		{/each}
	</ul>
	<form method="POST" action="?/addCalling" use:enhance class="actions">
		<div class="field" style="flex: 1; margin: 0; min-width: 16rem">
			<label for="newCalling">Neue Berufung</label>
			<input id="newCalling" name="name" type="text" placeholder="z.B. Tempelpräsident" required />
		</div>
		<button class="btn btn-primary" type="submit">Hinzufügen</button>
	</form>
</details>

{#if showForm}
	<div class="section">
		<form method="POST" action="?/create" class="grid-3">
			<div class="field"><label for="fn">Vorname</label><input id="fn" name="firstName" type="text" required /></div>
			<div class="field"><label for="ln">Nachname (optional)</label><input id="ln" name="lastName" type="text" /></div>
			<div class="field">
				<label for="calling">Berufung</label>
				<select id="calling" name="stakeCallingId">
					<option value="">– keine –</option>
					{#each data.callings as c}<option value={c.id}>{c.name}</option>{/each}
				</select>
			</div>
			<div class="actions"><button class="btn btn-primary" type="submit">Hinzufügen</button></div>
		</form>
	</div>
{/if}

<div class="section table-wrap">
	<table class="table stack">
		<thead><tr><th>Name</th><th>Berufung</th>{#if data.showAll}<th>Status</th>{/if}</tr></thead>
		<tbody>
			{#each data.officers as o}
				<tr class="clickable" onclick={() => goto(`/mitglieder/${o.id}`)}>
					<td class="td-main"><a href="/mitglieder/{o.id}">{o.name}</a></td>
					<td data-label={o.calling ? 'Berufung' : null}>{o.calling}</td>
					{#if data.showAll}<td data-label="Status">{o.active ? 'auswählbar' : 'ausgeblendet'}</td>{/if}
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	summary { cursor: pointer; list-style: none; display: flex; align-items: center; gap: 0.5rem; }
	summary::-webkit-details-marker { display: none; }
	summary::before { content: "▸"; color: var(--muted); }
	details[open] summary::before { content: "▾"; }
	summary h2 { margin: 0; }
	details[open] summary { margin-bottom: 0.75rem; }
</style>
