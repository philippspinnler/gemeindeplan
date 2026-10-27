<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatDateShort } from '$lib/dates';
	let { data, form } = $props();
	const SIDES: Record<string, string> = { jd: 'JD', jm: 'JM', both: 'beide' };
</script>

<div class="section-title"><h2>Ideen für Aktivitäten</h2></div>

{#if form?.error}<div class="error">{form.error}</div>{/if}

<div class="section">
	<form method="POST" action="?/create" use:enhance class="grid-3">
		<div class="field"><label for="text">Idee</label><input id="text" name="text" type="text" required /></div>
		<div class="field">
			<label for="side">Für</label>
			<select id="side" name="side">
				{#each Object.entries(SIDES) as [k, l]}<option value={k} selected={k === 'both'}>{l}</option>{/each}
			</select>
		</div>
		<div class="field"><label for="note">Notiz</label><input id="note" name="note" type="text" /></div>
		<div class="actions"><button class="btn btn-primary" type="submit">Hinzufügen</button></div>
	</form>
</div>

<div class="section table-wrap">
	<table class="table stack">
		<thead><tr><th>Idee</th><th>Für</th><th>Notiz</th><th>Von</th><th>Seit</th><th></th></tr></thead>
		<tbody>
			{#each data.open as i (i.id)}
				<tr>
					<td class="td-main">{i.text}</td>
					<td data-label="Für">{SIDES[i.side]}</td>
					<td data-label={i.note ? 'Notiz' : null}>{i.note ?? ''}</td>
					<td data-label="Von">{i.createdByName}</td>
					<td data-label="Seit">{formatDateShort(i.createdAt.slice(0, 10))}</td>
					<td>
						<form method="POST" action="?/dismiss" use:enhance>
							<input type="hidden" name="id" value={i.id} />
							<button class="btn btn-small" type="submit">Verwerfen</button>
						</form>
					</td>
				</tr>
			{:else}
				<tr><td colspan="6">Keine offenen Ideen für Aktivitäten.</td></tr>
			{/each}
		</tbody>
	</table>
</div>

{#if data.planned.length}
	<details class="section">
		<summary>Geplant / verworfen ({data.planned.length})</summary>
		<ul>
			{#each data.planned as i (i.id)}
				<li>
					{i.text} ({SIDES[i.side]})
					{#if i.date}– <a href="/jugend/{i.date}">{formatDateShort(i.date)}</a>{:else}– verworfen{/if}
				</li>
			{/each}
		</ul>
	</details>
{/if}
