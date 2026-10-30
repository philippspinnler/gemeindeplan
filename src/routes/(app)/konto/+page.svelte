<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatChangeTime } from '$lib/dates';
	let { data, form } = $props();

	const key = $derived(form?.mcpKey as string | undefined);
	const codeCommand = $derived(key ? `claude mcp add --transport http gemeindeplan ${data.mcp?.endpoint} --header "Authorization: Bearer ${key}"` : '');
	const desktopJson = $derived(
		key
			? JSON.stringify({ mcpServers: { gemeindeplan: { command: 'npx', args: ['-y', 'mcp-remote', data.mcp?.endpoint, '--header', `Authorization:Bearer ${key}`] } } }, null, 2)
			: ''
	);
	let copied = $state('');
	async function copy(label: string, text: string) {
		await navigator.clipboard.writeText(text);
		copied = label;
	}
</script>

<h1>Konto</h1>

<div class="section">
	<p><strong>{data.account.name}</strong><br /><span class="muted">{data.account.email} · {data.account.role}</span></p>
</div>

<div class="section">
	<h2>Passwort ändern</h2>
	{#if form?.error}<div class="error">{form.error}</div>{/if}
	{#if form?.changed}<div class="success">Passwort geändert. Andere Geräte müssen sich neu anmelden.</div>{/if}
	<form method="POST" action="?/password" use:enhance class="password-form">
		<div class="field"><label for="current">Bisheriges Passwort</label><input id="current" name="current" type="password" required autocomplete="current-password" /></div>
		<div class="field"><label for="next">Neues Passwort</label><input id="next" name="next" type="password" required minlength={data.minLength} autocomplete="new-password" /></div>
		<div class="field"><label for="repeat">Neues Passwort wiederholen</label><input id="repeat" name="repeat" type="password" required minlength={data.minLength} autocomplete="new-password" /></div>
		<p class="hint">Mindestens {data.minLength} Zeichen.</p>
		<button class="btn btn-primary" type="submit">Passwort ändern</button>
	</form>
</div>

{#if data.mcp}
	<div class="section">
		<h2>Claude (MCP)</h2>
		<p class="hint">Mit einem persönlichen Schlüssel kann Claude Desktop oder Claude Code Sonntags- und Klassenthemen lesen und eintragen. Alles erscheint unter deinem Namen im Verlauf.</p>
		{#if key}
			<p class="success">Der Schlüssel wird nur jetzt angezeigt. Ein früherer Schlüssel gilt nicht mehr.</p>
			<h3>Claude Code</h3>
			<pre>{codeCommand}</pre>
			<button class="btn btn-small" type="button" onclick={() => copy('code', codeCommand)}>{copied === 'code' ? 'Kopiert' : 'Befehl kopieren'}</button>
			<h3>Claude Desktop</h3>
			<p class="hint">In Claude Desktop unter Einstellungen → Entwickler → Konfiguration bearbeiten einfügen (braucht Node.js), dann Claude Desktop neu starten.</p>
			<pre>{desktopJson}</pre>
			<button class="btn btn-small" type="button" onclick={() => copy('desktop', desktopJson)}>{copied === 'desktop' ? 'Kopiert' : 'Konfiguration kopieren'}</button>
		{:else if data.mcp.active}
			<p>Schlüssel aktiv. {data.mcp.usedAt ? `Zuletzt benutzt ${formatChangeTime(data.mcp.usedAt)}.` : 'Noch nie benutzt.'}</p>
		{:else}
			<p>{form?.mcpRevoked ? 'Schlüssel widerrufen.' : 'Kein Schlüssel.'}</p>
		{/if}
		<div class="actions">
			<form method="POST" action="?/mcpKey" use:enhance><button class="btn" type="submit">{data.mcp.active || key ? 'Neuen Schlüssel erzeugen' : 'Schlüssel erzeugen'}</button></form>
			{#if data.mcp.active || key}
				<form method="POST" action="?/mcpRevoke" use:enhance><button class="btn btn-danger" type="submit">Widerrufen</button></form>
			{/if}
		</div>
	</div>
{/if}

<style>
	pre { white-space: pre-wrap; overflow-wrap: anywhere; background: var(--bg); border: 1px solid var(--line); border-radius: var(--radius); padding: 0.6rem 0.8rem; font-size: 0.85rem; margin: 0.25rem 0 0.5rem; }
	h3 { font-size: 1rem; margin: 1rem 0 0.25rem; }
	.password-form { max-width: 28rem; }
</style>
