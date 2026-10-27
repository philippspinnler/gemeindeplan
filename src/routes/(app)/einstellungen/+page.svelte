<script lang="ts">
	import { enhance } from '$app/forms';
	let { data, form } = $props();
	const submitOnChange = (e: Event) => (e.currentTarget as HTMLInputElement).form?.requestSubmit();
</script>

{#if form?.error}<div class="error">{form.error}</div>{/if}
{#if form?.saved}<div class="success">Gespeichert.</div>{/if}

<div class="section">
	<h2>Allgemein</h2>
	<form method="POST" action="?/general" use:enhance>
		<div class="field"><label for="ward">Gemeindename</label><input id="ward" name="ward_name" type="text" value={data.settings.ward_name} required onchange={submitOnChange} /></div>
		<div class="actions"><a class="btn" href="/admin/export">Datenbank herunterladen (Backup)</a></div>
	</form>
</div>
