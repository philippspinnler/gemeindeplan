<script lang="ts">
	import { enhance } from '$app/forms';
	import { createAutosave } from '$lib/autosave.svelte';
	let { data, form } = $props();
	let formError = $derived(form?.error);
	const b = $derived(data.brk);
	let kind = $state('');
	$effect.pre(() => {
		kind = data.brk.kind;
	});
	const autosave = createAutosave({ deps: () => data, onSaved: () => (formError = undefined) });
</script>

<p><a class="back" href="/jugend/ausfaelle">Ausfälle & Pfahltermine</a></p>
<h2>{b.label ?? data.kinds[b.kind]}</h2>
{#if formError}<div class="error">{formError}</div>{/if}

<div class="section">
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<form id="breakForm" method="POST" action="?/update" use:enhance={() => autosave.saved('break')} {...autosave.handlers}>
		<input type="hidden" name="version" value={data.version} />
		<div class="grid-2">
			<div class="field">
				<label for="kind">Art</label>
				<select id="kind" name="kind" bind:value={kind}>
					{#each Object.entries(data.kinds) as [k, l]}<option value={k}>{l}</option>{/each}
				</select>
			</div>
			<div class="field"><label for="label">Bezeichnung</label><input id="label" name="label" type="text" value={b.label ?? ''} placeholder="z.B. Herbstferien" /></div>
			<div class="field"><label for="from">Von</label><input id="from" name="fromDate" type="date" required value={b.fromDate} /></div>
			<div class="field"><label for="to">Bis</label><input id="to" name="toDate" type="date" value={b.toDate === b.fromDate ? '' : b.toDate} /></div>
		</div>
		{#if kind !== 'ferien'}<label class="check"><input type="checkbox" name="cancels" value="1" checked={b.cancels} /> Mittwochsaktivität fällt aus</label>{/if}
	</form>
	<form method="POST" action="?/delete" class="actions" style="justify-content: flex-end">
		<button class="btn btn-danger" type="submit">Löschen</button>
	</form>
	<div class="savebar no-print">
		<span class="savebar-status" class:err={autosave.status.kind === 'error'}>{autosave.status.text}</span>
		{#if autosave.conflict}<button class="btn btn-primary" type="button" onclick={() => location.reload()}>Seite neu laden</button>{/if}
	</div>
</div>
