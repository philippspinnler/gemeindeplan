<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import MemberSelect from '$lib/components/MemberSelect.svelte';
	let { data, form } = $props();
	let newSide = $state<'jd' | 'jm'>('jd');
	let copied = $state(false);
	const submitOnChange = (e: Event) => (e.currentTarget as HTMLSelectElement).form?.requestSubmit();
</script>

{#if form?.error}<div class="error">{form.error}</div>{/if}
{#if form?.saved}<div class="success">Gespeichert.</div>{/if}

<div class="section">
	<h2>Jugendseite</h2>
	<p class="muted">Öffentliche Seite ohne Anmeldung mit den nächsten Terminen der Jugend. Wer den Link hat, kann sie sehen; mit «Neu erzeugen» wird der alte Link ungültig. Der Link steht auch oben auf der Seite Jugend.</p>
	{#if data.youthToken}
		{@const link = `${page.url.origin}/j/${data.youthToken}`}
		<div class="field"><input type="text" readonly value={link} aria-label="Link zur Jugendseite" onfocus={(e) => e.currentTarget.select()} /></div>
	{:else}
		<p>Link: noch nicht erzeugt</p>
	{/if}
	<form method="POST" action="?/youthToken" use:enhance>
		<div class="actions">
			{#if data.youthToken}
				<button class="btn" type="button" onclick={async () => { await navigator.clipboard.writeText(`${page.url.origin}/j/${data.youthToken}`); copied = true; setTimeout(() => (copied = false), 2000); }}>{copied ? 'Kopiert' : 'Link kopieren'}</button>
			{/if}
			<button class="btn" type="submit">{data.youthToken ? 'Neu erzeugen' : 'Link erzeugen'}</button>
		</div>
	</form>
</div>

<div class="section">
	<h2>Jugendliche</h2>
	<p class="hint">Wer zu den Jungen Damen oder Jungen Männern gehört und in welcher Gruppe. Auf der öffentlichen Jugendseite stehen nur die Vornamen.</p>
	<!-- Forms live outside the table; the row's fields attach via form="…". -->
	{#each data.youth as y (y.memberId)}
		<form id="set-{y.memberId}" method="POST" action="?/set" use:enhance><input type="hidden" name="memberId" value={y.memberId} /></form>
		<form id="remove-{y.memberId}" method="POST" action="?/remove" use:enhance><input type="hidden" name="memberId" value={y.memberId} /></form>
	{/each}
	<div class="table-wrap">
		<table class="table stack youth-table">
			<thead><tr><th>Name</th><th>Seite</th><th>Gruppe</th><th></th></tr></thead>
			<tbody>
				{#each data.youth as y (y.memberId)}
					<tr>
						<td class="td-main">{y.name}</td>
						<td data-label="Seite">
							<select name="side" aria-label="Seite" form="set-{y.memberId}" onchange={submitOnChange}>
								<option value="jd" selected={y.side === 'jd'}>JD</option>
								<option value="jm" selected={y.side === 'jm'}>JM</option>
							</select>
						</td>
						<td data-label="Gruppe">
							<select name="group" aria-label="Gruppe" form="set-{y.memberId}" onchange={submitOnChange}>
								<option value="" selected={y.group === null}>–</option>
								{#each data.groups[y.side] as g}<option value={g.id} selected={y.group === g.id}>{g.label}</option>{/each}
							</select>
						</td>
						<td class="td-actions"><button class="btn btn-small" type="submit" form="remove-{y.memberId}">Entfernen</button></td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<div class="section">
	<h2>Hinzufügen</h2>
	<form method="POST" action="?/set" use:enhance class="actions">
		<div class="field" style="flex: 1; margin: 0; min-width: 16rem">
			<label for="new-member">Name</label>
			<MemberSelect id="new-member" name="memberId" options={data.candidates} />
		</div>
		<div class="field" style="margin: 0">
			<label for="new-side">Seite</label>
			<select id="new-side" name="side" bind:value={newSide}>
				<option value="jd">JD</option>
				<option value="jm">JM</option>
			</select>
		</div>
		<div class="field" style="margin: 0">
			<label for="new-group">Gruppe</label>
			<select id="new-group" name="group">
				<option value="">–</option>
				{#each data.groups[newSide] as g}<option value={g.id}>{g.label}</option>{/each}
			</select>
		</div>
		<button class="btn btn-primary" type="submit">Hinzufügen</button>
	</form>
</div>

<style>
	.youth-table select { min-width: 9rem; }
	.youth-table .td-actions { text-align: right; }
</style>
