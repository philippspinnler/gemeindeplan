<script lang="ts">
	import { page } from '$app/state';
	let { self }: { self: { id: number; name: string; sig: string } | null } = $props();

	let dialog: HTMLDialogElement;
	let person = $state('');
	let seite = $state('');
	let tag = $state('');
	let copied = $state(false);

	const url = $derived.by(() => {
		const q = new URLSearchParams();
		if (person && self) {
			q.set('person', String(self.id));
			q.set('sig', self.sig);
		} else if (seite) q.set('seite', seite);
		if (tag) q.set('tag', tag);
		const query = q.toString();
		return `${page.url.host}${page.url.pathname.replace(/\/$/, '')}/kalender.ics${query ? `?${query}` : ''}`;
	});

	async function copy() {
		await navigator.clipboard.writeText(`${page.url.protocol}//${url}`);
		copied = true;
	}
</script>

<button class="btn subscribe" type="button" onclick={() => dialog.showModal()}>Im Kalender abonnieren</button>

<dialog bind:this={dialog} class="news-dialog" onclose={() => (copied = false)}>
	<h2>Im Kalender abonnieren</h2>
	{#if self}
		<div class="field">
			<label for="cal-person">Für wen?</label>
			<select id="cal-person" bind:value={person}>
				<option value="">Alle</option>
				<option value="self">Nur meine Termine ({self.name})</option>
			</select>
		</div>
	{/if}
	{#if person && self}
		<p class="hint">Mittwochs die Aktivitäten, bei denen du als anwesend eingetragen bist, sonntags die Klassen, die du unterrichtest. Den Link nicht weitergeben: er zeigt deine Termine.</p>
	{:else}
		<div class="field">
			<label for="cal-seite">JD / JM</label>
			<select id="cal-seite" bind:value={seite}>
				<option value="">Beide</option>
				<option value="jd">Nur Junge Damen</option>
				<option value="jm">Nur Junge Männer</option>
			</select>
		</div>
	{/if}
	<div class="field">
		<label for="cal-tag">Termine</label>
		<select id="cal-tag" bind:value={tag}>
			<option value="">Mittwoch und Sonntag</option>
			<option value="mi">Nur Mittwochsaktivitäten</option>
			<option value="so">Nur Sonntagsklassen</option>
		</select>
	</div>
	<div class="actions">
		<a class="btn btn-primary" href={`webcal://${url}`}>Abonnieren</a>
		<button class="btn" type="button" onclick={copy}>{copied ? 'Kopiert' : 'Link kopieren'}</button>
	</div>
	<p class="hint">Für Google Kalender: Link kopieren und unter „Per URL hinzufügen“ einfügen.</p>
	<form method="dialog"><button class="btn">Schliessen</button></form>
</dialog>

<style>
	.subscribe { margin-bottom: 12px; }
	.actions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.6rem; }
</style>
