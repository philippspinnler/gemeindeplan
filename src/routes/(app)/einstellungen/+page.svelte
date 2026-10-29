<script lang="ts">
	import { enhance } from '$app/forms';
	let { data, form } = $props();
	const submitOnChange = (e: Event) => (e.currentTarget as HTMLInputElement).form?.requestSubmit();
	// The default reset would put already saved fields back to their initial (empty) value.
	const keepValues = () => ({ update }: { update: (o: { reset: boolean }) => Promise<void> }) => update({ reset: false });
</script>

{#if form?.error}<div class="error">{form.error}</div>{/if}
{#if form?.saved}<div class="success">Gespeichert.</div>{/if}

<div class="section">
	<h2>Allgemein</h2>
	<form method="POST" action="?/general" use:enhance={keepValues}>
		<div class="field"><label for="ward">Gemeindename</label><input id="ward" name="ward_name" type="text" value={data.settings.ward_name} required onchange={submitOnChange} /></div>
		<div class="actions"><a class="btn" href="/admin/export">Datenbank herunterladen (Backup)</a></div>
	</form>
</div>

<div class="section">
	<h2>Jugend-Zeiten</h2>
	<p class="hint">Die üblichen Zeiten der Jugendtermine. Sie gelten für alle Termine im Kalender-Abo; erst wenn beide vollständig sind, erscheint auf der Jugendseite der Knopf „Im Kalender abonnieren“.</p>
	<form method="POST" action="?/times" use:enhance={keepValues} class="times">
		{#each [{ key: 'wed', label: 'Mittwochsaktivität' }, { key: 'sun', label: 'Sonntagsklasse' }] as row (row.key)}
			<fieldset>
				<legend>{row.label}</legend>
				<input name="youth_{row.key}_start" type="time" aria-label="{row.label} von" value={data.settings[`youth_${row.key}_start` as 'youth_wed_start']} onchange={submitOnChange} />
				<span aria-hidden="true">bis</span>
				<input name="youth_{row.key}_end" type="time" aria-label="{row.label} bis" value={data.settings[`youth_${row.key}_end` as 'youth_wed_end']} onchange={submitOnChange} />
			</fieldset>
		{/each}
	</form>
</div>

<style>
	.times { display: grid; gap: 0.6rem; margin-top: 0.9rem; }
	fieldset { display: grid; grid-template-columns: 11rem 7.5rem max-content 7.5rem; justify-content: start; align-items: center; gap: 0.6rem; border: 0; margin: 0; padding: 0; }
	legend { float: left; font-weight: 600; font-size: 0.95rem; padding: 0; }
	fieldset span { color: var(--muted); }
	@media (max-width: 520px) {
		fieldset { grid-template-columns: 1fr auto 1fr; }
		legend { grid-column: 1 / -1; }
	}
</style>
