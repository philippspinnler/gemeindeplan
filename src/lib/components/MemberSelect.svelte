<script lang="ts">
	/**
	 * Picker with search (members, hymns): typing filters the list, click or Enter selects.
	 * The selected value reaches the form via a hidden field.
	 */
	type Option = { id: number; label: string; hint: string };
	let {
		id,
		name,
		options,
		value = null,
		form = undefined,
		placeholder = 'Name tippen …',
		emptyLabel = undefined,
		serialize = (id: number | null) => (id === null ? '' : String(id)),
		numbered = false,
		noMatch = 'Kein Treffer. Andere Schreibweise versuchen.'
	}: {
		id: string;
		name: string;
		options: Option[];
		value?: number | null;
		form?: string;
		placeholder?: string;
		/** Label of an extra entry that clears the selection, only where empty means something (e.g. "automatisch: …"); otherwise ✕ or Backspace clear it. */
		emptyLabel?: string;
		/** Form value for the selected id; allows special cases such as free-text names. */
		serialize?: (id: number | null) => string;
		/** Labels start with a number (hymns): a typed number matches that prefix. */
		numbered?: boolean;
		noMatch?: string;
	} = $props();

	let selected = $state<number | null>(null);
	let query = $state('');
	let open = $state(false);
	let active = $state(0);
	let root: HTMLDivElement;
	let hidden: HTMLInputElement;
	let syncedValue = $state<number | null | undefined>(undefined);

	// Re-sync the selected value when the page loads a different Sunday.
	$effect(() => {
		if (value !== syncedValue) {
			selected = value ?? null;
			syncedValue = value;
			query = '';
			open = false;
		}
	});

	const current = $derived(options.find((o) => o.id === selected) ?? null);
	const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
	const matches = $derived.by(() => {
		const q = fold(query.trim());
		const words = q.split(/\s+/).filter(Boolean);
		const list = numbered && /^\d+$/.test(q) ? options.filter((o) => (o.label.match(/^\d+/)?.[0] ?? '').startsWith(q)) : words.length ? options.filter((o) => words.every((w) => fold(o.label).includes(w))) : options;
		return list.slice(0, 60);
	});

	function choose(o: Option | null) {
		selected = o?.id ?? null;
		queueMicrotask(() => hidden.dispatchEvent(new Event('change', { bubbles: true })));
		query = '';
		open = false;
	}
	function onInput(e: Event) {
		query = (e.currentTarget as HTMLInputElement).value;
		open = true;
		active = 0;
	}
	function onKey(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			open = true;
			active = Math.min(active + 1, matches.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			active = Math.max(active - 1, 0);
		} else if (e.key === 'Enter') {
			if (open) {
				e.preventDefault();
				if (matches[active]) choose(matches[active]);
			}
		} else if ((e.key === 'Backspace' || e.key === 'Delete') && !query && current) {
			choose(null);
		} else if (e.key === 'Escape') {
			open = false;
			query = '';
		}
	}
	function onFocusOut(e: FocusEvent) {
		if (root.contains(e.relatedTarget as Node | null)) return;
		open = false;
		query = '';
	}
</script>

<div class="combo" bind:this={root} onfocusout={onFocusOut}>
	<input type="hidden" {name} {form} bind:this={hidden} value={serialize(selected)} />
	<input
		{id}
		type="text"
		class="combo-input"
		role="combobox"
		aria-expanded={open}
		aria-controls="{id}-list"
		aria-autocomplete="list"
		autocomplete="off"
		inputmode={numbered ? 'search' : undefined}
		value={open ? query : (current?.label ?? '')}
		placeholder={current ? current.label : placeholder}
		oninput={onInput}
		onfocus={() => (open = true)}
		onclick={() => (open = true)}
		onkeydown={onKey}
	/>
	{#if current && !open}
		<button type="button" class="combo-clear" aria-label="Auswahl entfernen" onclick={() => choose(null)}>✕</button>
	{/if}
	{#if open}
		<!-- Keyboard goes through the input (arrows, Enter, Escape); the entries themselves are for mouse and touch only. -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<ul class="combo-list" id="{id}-list" role="listbox">
			{#if current && emptyLabel}
				<li class="combo-item combo-none" role="option" aria-selected="false" tabindex="-1" onmousedown={(e) => e.preventDefault()} onclick={() => choose(null)}>{emptyLabel}</li>
			{/if}
			{#each matches as o, i (o.id)}
				<li
					class="combo-item"
					class:active={i === active}
					class:chosen={o.id === selected}
					role="option"
					aria-selected={i === active}
					tabindex="-1"
					onmousedown={(e) => e.preventDefault()}
					onmouseenter={() => (active = i)}
					onclick={() => choose(o)}
				>
					<span>{o.label}</span>{#if o.hint}<span class="combo-hint">{o.hint}</span>{/if}
				</li>
			{/each}
			{#if matches.length === 0}
				<li class="combo-empty">{noMatch}</li>
			{:else if matches.length === 60}
				<li class="combo-empty">Mehr Treffer vorhanden, bitte weiter tippen.</li>
			{/if}
		</ul>
	{/if}
</div>
