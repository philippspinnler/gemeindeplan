<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatDateShort } from '$lib/dates';
	let { data, form } = $props();
	import { ROLE_HELP, ROLE_LABELS } from '$lib/roles';
	const roles = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }));
	let newRole = $state('bischofschaft');
	let copied = $state(false);
	const invited = $derived(form?.invited);
	async function copy(text: string) {
		await navigator.clipboard.writeText(text);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
</script>

<h2>Benutzer</h2>
<p class="hint">Wer sich anmelden kann und mit welcher Rolle. «Mitglied» verknüpft ein Konto mit der Person in der Mitgliederliste; damit kann sie auf der Jugendseite nur ihre eigenen Termine abonnieren. Wechselt eine Berufung: neue Person einladen und das alte Konto deaktivieren. Hat jemand das Passwort vergessen: «Passwort zurücksetzen» erzeugt einen neuen Link.</p>
{#if form?.error}<div class="error">{form.error}</div>{/if}

<div class="section">
	<h2>Neue Person einladen</h2>
	<form method="POST" action="?/invite" use:enhance class="grid-3">
		<div class="field">
			<label for="inv-member">Mitglied</label>
			<select id="inv-member" name="memberId" required>
				<option value="">Bitte wählen</option>
				{#each data.members as m (m.id)}<option value={m.id}>{m.name}</option>{/each}
			</select>
		</div>
		<div class="field"><label for="inv-email">E-Mail</label><input id="inv-email" name="email" type="email" required /></div>
		<div class="field">
			<label for="inv-role">Rolle</label>
			<select id="inv-role" name="role" bind:value={newRole}>{#each roles as r}<option value={r.value}>{r.label}</option>{/each}</select>
			<span class="hint">{ROLE_HELP[newRole as keyof typeof ROLE_HELP]}</span>
		</div>
		<div class="actions"><button class="btn btn-primary" type="submit">Einladung erzeugen</button></div>
	</form>
	{#if invited}
		<div class="success">Link erstellt. Kopiere den Text und schicke ihn der Person.</div>
		<div class="copy-box">{invited.text}</div>
		<div class="actions">
			<button class="btn" type="button" onclick={() => copy(invited.text)}>{copied ? 'Kopiert' : 'Text kopieren'}</button>
			<button class="btn" type="button" onclick={() => copy(invited.link)}>Nur Link kopieren</button>
		</div>
	{/if}
</div>

{#if data.invites.length}
	<div class="section">
		<h2>Offene Einladungen</h2>
		<div class="table-wrap">
			<table class="table stack">
				<thead><tr><th>Name</th><th>E-Mail</th><th>Rolle</th><th>Gültig bis</th><th></th></tr></thead>
				<tbody>
					{#each data.invites as inv}
						<tr>
							<td class="td-main">{inv.name}</td><td data-label="E-Mail">{inv.email}</td><td data-label="Rolle">{ROLE_LABELS[inv.role]}</td><td data-label="Gültig bis">{formatDateShort(inv.expiresAt.slice(0, 10))}</td>
							<td>
								<form method="POST" action="?/deleteInvite" use:enhance>
									<input type="hidden" name="id" value={inv.id} />
									<button class="btn btn-small btn-danger" type="submit">Löschen</button>
								</form>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
{/if}

<div class="section">
	<h2>Konten</h2>
	<div class="table-wrap">
		<table class="table stack">
			<thead><tr><th>Name</th><th>E-Mail</th><th>Rolle</th><th>Mitglied</th><th>Status</th><th></th></tr></thead>
			<tbody>
				{#each data.users as u}
					<tr>
						<td class="td-main">{u.name}</td>
						<td data-label="E-Mail">{u.email}</td>
						<td data-label="Rolle">
							{#if u.id === data.user?.id}
								{roles.find((r) => r.value === u.role)?.label}
							{:else}
								<form method="POST" action="?/setRole" use:enhance>
									<input type="hidden" name="id" value={u.id} />
									<select name="role" onchange={(e) => (e.currentTarget as HTMLSelectElement).form?.requestSubmit()}>
										{#each roles as r}<option value={r.value} selected={r.value === u.role}>{r.label}</option>{/each}
									</select>
								</form>
							{/if}
						</td>
						<td data-label="Mitglied">
							<form method="POST" action="?/setMember" use:enhance={() => ({ update }) => update({ reset: false })}>
								<input type="hidden" name="id" value={u.id} />
								<select name="memberId" aria-label="Mitglied von {u.name}" onchange={(e) => (e.currentTarget as HTMLSelectElement).form?.requestSubmit()}>
									<option value="">–</option>
									{#each data.members as m (m.id)}<option value={m.id} selected={m.id === u.memberId}>{m.name}</option>{/each}
								</select>
							</form>
						</td>
						<td data-label="Status">{u.active ? 'aktiv' : 'deaktiviert'}</td>
						<td>
							{#if u.id !== data.user?.id}
								<div class="actions">
									<form method="POST" action="?/setActive" use:enhance>
										<input type="hidden" name="id" value={u.id} />
										<input type="hidden" name="active" value={u.active ? '0' : '1'} />
										<button class="btn btn-small" type="submit">{u.active ? 'Deaktivieren' : 'Aktivieren'}</button>
									</form>
									{#if u.active}
										<form method="POST" action="?/resetPassword" use:enhance>
											<input type="hidden" name="id" value={u.id} />
											<button class="btn btn-small" type="submit">Passwort zurücksetzen</button>
										</form>
									{/if}
								</div>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
