<script lang="ts">
	import { page } from '$app/state';
	type Person = { id: number; name: string };
	let { youth, adults }: { youth: Person[]; adults: Person[] } = $props();

	let dialog: HTMLDialogElement;
	let person = $state('');
	let seite = $state('');
	let tag = $state('');
	let copied = $state(false);

	const url = $derived.by(() => {
		const q = new URLSearchParams();
		if (person) q.set('person', person);
		else if (seite) q.set('seite', seite);
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
	<div class="field">
		<label for="cal-person">Für wen?</label>
		<select id="cal-person" bind:value={person}>
			<option value="">Alle</option>
			<optgroup label="Jugendliche">{#each youth as p (p.id)}<option value={String(p.id)}>{p.name}</option>{/each}</optgroup>
			<optgroup label="Leitung">{#each adults as p (p.id)}<option value={String(p.id)}>{p.name}</option>{/each}</optgroup>
		</select>
	</div>
	{#if person}
		<p class="hint">Bei einer Person ergibt sich JD oder JM aus ihrer Seite. Jugendliche erhalten alle Aktivitäten und die Klassen, die sie unterrichten; Leiter die Aktivitäten, bei denen sie dabei sind, und ihre Klassen.</p>
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
