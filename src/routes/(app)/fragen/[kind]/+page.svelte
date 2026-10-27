<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import SortHeader from '$lib/components/SortHeader.svelte';
	import { DEFAULT_ASK_SORT, sortAskRows, type AskRow, type AskSortState } from '$lib/ask-sort';
	import { whatsappAskUrl } from '$lib/whatsapp';
	let { data } = $props();
	let sort = $state<AskSortState>(DEFAULT_ASK_SORT);
	const rows = $derived(sortAskRows(data.rows, sort));
	const onsort = (s: AskSortState) => (sort = s);
	/** Row whose note is being edited. */
	let editing = $state<number | null>(null);
	const focus = (el: HTMLInputElement) => el.focus();
	let dialog: HTMLDialogElement;
	/** Member being asked in the dialog, the chosen Sunday and talk length. */
	let asking = $state<AskRow | null>(null);
	let askDate = $state('');
	let askMinutes = $state<number | null>(null);
	let askError = $state('');
	const options = $derived(asking ? data.sundays.filter((s) => !s.memberIds.includes(asking!.id)) : []);
	const chosen = $derived(options.find((s) => s.date === askDate));
	function pick(date: string) {
		askDate = date;
		askMinutes = data.sundays.find((s) => s.date === date)?.suggest ?? null;
	}
	function openAsk(r: AskRow) {
		asking = r;
		pick(data.sundays.find((s) => !s.memberIds.includes(r.id))?.date ?? '');
		dialog.showModal();
	}
	function askUrl(r: AskRow, s: (typeof data.sundays)[number]): string {
		const task = data.askKind === 'talk' ? 'eine Ansprache zu geben' : s.position === 1 ? 'das Anfangsgebet zu sprechen' : 'das Schlussgebet zu sprechen';
		return whatsappAskUrl({ firstName: r.firstName, task, date: s.date, theme: data.askKind === 'talk' ? s.theme : null, minutes: askMinutes, sender: data.sender });
	}
</script>

<p class="hint">Zuoberst steht, wer am längsten nicht dran war. Eingeplante stehen grau am Ende. {data.hint}{#if data.canNote}{' '}Notizen lassen sich direkt in der Liste bearbeiten.{/if}{#if data.canAsk}{' '}«Anfragen» trägt die Person unbestätigt am gewählten Sonntag ein und öffnet WhatsApp mit einem vorbereiteten Text.{/if}</p>
{#if askError}<p class="error">{askError}</p>{/if}

<div class="section table-wrap">
	<table class="table stack">
		<thead>
			<tr>
				<SortHeader key="name" label="Name" {sort} {onsort} />
				<SortHeader key="last" label={data.column} {sort} {onsort} />
				<SortHeader key="note" label="Notiz" {sort} {onsort} />
				{#if data.canAsk}<th aria-label="Anfrage"></th>{/if}
			</tr>
		</thead>
		<tbody>
			{#each rows as r (r.id)}
				<tr class="clickable" onclick={() => goto(`/mitglieder/${r.id}`)}>
					<td class="td-main"><a href="/mitglieder/{r.id}">{r.name}</a></td>
					<td class:muted={r.planned} data-label={data.column}>{r.label}</td>
					{#if data.canNote}
						<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
						<td class="hint note-cell" data-label="Notiz" onclick={(e) => e.stopPropagation()}>
							{#if editing === r.id}
								<form method="POST" action="?/note" class="note-form" use:enhance={() => async ({ update }) => { editing = null; await update(); }}>
									<input type="hidden" name="id" value={r.id} />
									<input name="note" type="text" value={r.note} maxlength="200" use:focus onkeydown={(e) => { if (e.key === 'Escape') editing = null; }} />
									<button class="btn btn-small btn-primary" type="submit">Speichern</button>
								</form>
							{:else}
								<button type="button" class="note-btn" onclick={() => (editing = r.id)} title="Notiz bearbeiten">{r.note || '＋ Notiz'}</button>
							{/if}
						</td>
					{:else}
						<td class="hint" data-label={r.note ? 'Notiz' : null}>{r.note}</td>
					{/if}
					{#if data.canAsk}
						<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
						<td class="ask-cell" onclick={(e) => e.stopPropagation()}>
							<button type="button" class="btn btn-small" onclick={() => openAsk(r)}>Anfragen</button>
						</td>
					{/if}
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<dialog bind:this={dialog} class="ask-dialog" onclose={() => (asking = null)}>
	{#if asking}
		<h2>Anfrage an {asking.name}</h2>
		{#if options.length}
			<form
				method="POST"
				action="?/ask"
				use:enhance={() => {
					const r = asking!;
					window.open(askUrl(r, chosen!), '_blank', 'noopener');
					dialog.close();
					return async ({ result, update }) => {
						askError = result.type === 'failure' ? String(result.data?.error ?? '') : '';
						await update();
					};
				}}
			>
				<input type="hidden" name="id" value={asking.id} />
				<div class="field">
					<label for="ask-date">Sonntag</label>
					<select id="ask-date" name="date" value={askDate} onchange={(e) => pick(e.currentTarget.value)}>
						{#each options as s (s.date)}
							<option value={s.date}>{s.label} – {data.askKind === 'talk' ? `noch ${s.free} Min.` : `${s.free} frei`}</option>
						{/each}
					</select>
				</div>
				{#if data.askKind === 'talk'}
					<div class="field">
						<span class="label">Thema</span>
						<span class:hint={!chosen?.theme}>{chosen?.theme || 'Noch kein Thema festgelegt'}</span>
					</div>
					<div class="field">
						<label for="ask-minutes">Dauer (Minuten)</label>
						<input id="ask-minutes" name="minutes" type="number" min="1" max="30" required bind:value={askMinutes} />
					</div>
				{/if}
				<div class="actions">
					<button class="btn btn-primary" type="submit">In WhatsApp öffnen</button>
					<button class="btn" type="button" onclick={() => dialog.close()}>Abbrechen</button>
				</div>
			</form>
		{:else}
			<p class="hint">Kein Sonntag mit freiem Platz in den nächsten 12 Wochen.</p>
			<div class="actions"><button class="btn" type="button" onclick={() => dialog.close()}>Schliessen</button></div>
		{/if}
	{/if}
</dialog>

<style>
	.note-btn { background: none; border: 0; padding: 0; font: inherit; color: inherit; text-align: left; cursor: text; min-height: 1.5rem; width: 100%; }
	.note-btn:empty, .note-btn:hover { text-decoration: underline dotted; }
	.note-form { display: flex; gap: 0.4rem; align-items: center; }
	.note-form input { flex: 1; min-width: 8rem; }
	.ask-cell { text-align: right; white-space: nowrap; }
	.ask-dialog { border: 0; border-radius: var(--radius); padding: 1.2rem 1.4rem; width: min(26rem, calc(100vw - 2rem)); background: var(--surface); color: var(--text); }
	.ask-dialog::backdrop { background: rgb(0 0 0 / 0.35); }
	.ask-dialog h2 { margin: 0 0 1rem; font-size: 1.15rem; }
</style>
