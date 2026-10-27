<script lang="ts">
	import { enhance } from '$app/forms';
	import MemberSelect from '$lib/components/MemberSelect.svelte';
	let { data, form } = $props();
	const SINGLE = ['jd_praesidentin', 'jd_ratgeberin1', 'jd_ratgeberin2'];
	const submitOnChange = (e: Event) => (e.currentTarget as HTMLFormElement).requestSubmit();
</script>

{#if form?.error}<div class="error">{form.error}</div>{/if}
{#if form?.saved}<div class="success">Gespeichert.</div>{/if}

<div class="section">
	<h2>Bischofschaft</h2>
	<p class="hint">Leitung und Abwesenheiten beziehen sich auf diese drei Personen. Vorsitz: Bischof, sonst 1., sonst 2. Ratgeber.</p>
	<div class="grid-3">
		{#each data.bishopric as b (b.role)}
			<form method="POST" action="?/bishopric" use:enhance onchange={submitOnChange} class="field">
				<input type="hidden" name="role" value={b.role} />
				<label for="b-{b.role}">{b.label}</label>
				<MemberSelect id="b-{b.role}" name="memberId" options={data.candidates} value={b.memberId} />
			</form>
		{/each}
	</div>
</div>

<div class="section">
	<h2>Jugend</h2>
	<div class="grid-3">
		{#each data.leaders.filter((l) => SINGLE.includes(l.role)) as l (l.role)}
			<form method="POST" action="?/leaders" use:enhance onchange={submitOnChange} class="field">
				<input type="hidden" name="role" value={l.role} />
				<label for="l-{l.role}">{l.label}</label>
				<MemberSelect id="l-{l.role}" name="memberId" options={data.candidates} value={l.members[0]?.id ?? null} />
			</form>
		{/each}
	</div>
	{#each data.leaders.filter((l) => !SINGLE.includes(l.role)) as l (l.role)}
		<h3>{l.label}</h3>
		<ul class="row-list">
			{#each l.members as m (m.id)}
				<li>
					<span style="flex: 1">{m.name}</span>
					<form method="POST" action="?/leaders" use:enhance>
						<input type="hidden" name="role" value={l.role} />
						{#each l.members.filter((o) => o.id !== m.id) as o (o.id)}<input type="hidden" name="memberId" value={o.id} />{/each}
						<button class="btn btn-small" type="submit">Entfernen</button>
					</form>
				</li>
			{/each}
		</ul>
		{#key l.members.map((m) => m.id).join()}
			<form method="POST" action="?/leaders" use:enhance onchange={submitOnChange} class="field">
				<input type="hidden" name="role" value={l.role} />
				{#each l.members as o (o.id)}<input type="hidden" name="memberId" value={o.id} />{/each}
				<label for="add-{l.role}">Hinzufügen</label>
				<MemberSelect id="add-{l.role}" name="memberId" options={data.candidates} value={null} />
			</form>
		{/key}
	{/each}
</div>
