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
	<form method="POST" action="?/times" use:enhance={keepValues}>
		<div class="field"><label for="wed-start">Mittwochsaktivität von</label><input id="wed-start" name="youth_wed_start" type="time" value={data.settings.youth_wed_start} onchange={submitOnChange} /></div>
		<div class="field"><label for="wed-end">Mittwochsaktivität bis</label><input id="wed-end" name="youth_wed_end" type="time" value={data.settings.youth_wed_end} onchange={submitOnChange} /></div>
		<div class="field"><label for="sun-start">Sonntagsklasse von</label><input id="sun-start" name="youth_sun_start" type="time" value={data.settings.youth_sun_start} onchange={submitOnChange} /></div>
		<div class="field"><label for="sun-end">Sonntagsklasse bis</label><input id="sun-end" name="youth_sun_end" type="time" value={data.settings.youth_sun_end} onchange={submitOnChange} /></div>
		<p class="hint">Diese Zeiten gelten für alle Termine im Kalender-Abo der Jugendseite. Erst wenn alle vier gesetzt sind, erscheint dort der Knopf „Im Kalender abonnieren“.</p>
	</form>
</div>
