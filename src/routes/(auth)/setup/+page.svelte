<script lang="ts">
	let { form } = $props();
</script>

<main class="container auth-box">
	<div class="card">
		<h1>Ersteinrichtung</h1>
		<p class="muted">Lege das erste Admin-Konto an.</p>
		{#if form?.error}<div class="error">{form.error}</div>{/if}
		<form method="POST">
			<div class="field"><label for="name">Name</label><input id="name" name="name" type="text" required autocomplete="name" value={form?.name ?? ''} /></div>
			<div class="field"><label for="email">E-Mail</label><input id="email" name="email" type="email" required autocomplete="username" value={form?.email ?? ''} /></div>
			<div class="field"><label for="password">Passwort (mind. 8 Zeichen)</label><input id="password" name="password" type="password" required minlength="8" autocomplete="new-password" /></div>
			<button class="btn btn-primary" type="submit">Konto anlegen</button>
		</form>
	</div>
</main>
