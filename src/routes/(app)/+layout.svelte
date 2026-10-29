<script lang="ts">
	import { ROLE_LABELS } from '$lib/roles';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import { connectLive, live } from '$lib/live.svelte';
	let { data, children } = $props();

	// Live channel: show others' changes immediately, report and display presence.
	let conn: ReturnType<typeof connectLive> | undefined;
	onMount(() => {
		conn = connectLive(() => page.url.pathname);
		return conn.disconnect;
	});
	$effect(() => {
		page.url.pathname;
		conn?.pageChanged();
	});
	const othersHere = $derived([...new Set(live.others.filter((o) => o.page === page.url.pathname && o.userId !== data.user?.id).map((o) => o.name))]);
	/** Marks the field (or its .field wrapper) another user is in; CSS shows outline and name. */
	$effect(() => {
		const marked: Element[] = [];
		for (const o of live.others) {
			if (o.page !== page.url.pathname || o.userId === data.user?.id || !o.field) continue;
			const el = document.getElementById(o.field);
			const box = el?.closest('.field') ?? el;
			if (box) { box.setAttribute('data-live-user', o.name); marked.push(box); }
		}
		return () => marked.forEach((b) => b.removeAttribute('data-live-user'));
	});
	// A member page belongs to the section its back link points to (Anfragen or Einstellungen).
	const section = $derived(page.url.pathname.startsWith('/mitglieder/') ? String(page.data.backHref ?? '') : page.url.pathname);
	const isActive = (href: string) => (href === '/' ? section === '/' : section.startsWith(href));
	let newsDialog = $state<HTMLDialogElement>();
	$effect(() => {
		if (data.news.length && !newsDialog?.open) newsDialog?.showModal();
	});
	const dismissNews = () => fetch('/neuigkeiten', { method: 'POST', body: JSON.stringify({ count: data.newsCount }) });
	const role = $derived(data.user?.role);
	const accountRole = $derived(data.accountRole);
</script>

<nav class="topnav no-print">
	<div class="inner">
		<div class="nav-links">
			{#if !data.youthOnly}<a href="/" class:active={isActive('/')}>Sonntage</a>{/if}
			{#if data.canYouth}<a href="/jugend" class:active={isActive('/jugend')}>Jugend</a>{/if}
			{#if data.canHymns}<a href="/lieder" class:active={isActive('/lieder')}>Lieder</a>{/if}
			{#if data.canAsk}<a href="/fragen" class:active={isActive('/fragen')}>Anfragen</a>{/if}
			{#if role === 'admin'}
				<a href="/einstellungen/mitglieder" class:active={isActive('/einstellungen')}>Einstellungen</a>
			{/if}
		</div>
		<div class="nav-user">
			<button class="nav-account" class:active={isActive('/konto')} type="button" popovertarget="user-menu" aria-label={data.user?.name}><Icon name="user" size={16} /><span>{data.user?.name}</span><span aria-hidden="true">▾</span></button>
			<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
			<div id="user-menu" class="user-menu" popover onclick={(e) => (e.currentTarget as HTMLElement).hidePopover()}>
				<a href="/konto">Konto und Passwort</a>
				{#if accountRole === 'admin'}
					<form method="POST" action="/ansicht">
						<div class="user-menu-title">Ansicht als</div>
						{#each Object.entries(ROLE_LABELS) as [value, label] (value)}
							<button type="submit" name="role" {value} aria-current={value === role}>{label}</button>
						{/each}
					</form>
				{/if}
				<form method="POST" action="/logout"><button type="submit">Abmelden</button></form>
			</div>
		</div>
	</div>
</nav>
{#if accountRole === 'admin' && role !== accountRole}
	<div class="view-banner no-print">
		Testansicht als {ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role}
		<form method="POST" action="/ansicht" class="inline-form">
			<input type="hidden" name="role" value="admin" />
			<button class="btn btn-small" type="submit">Zurück zu Admin</button>
		</form>
	</div>
{/if}
{#if data.news.length}
	<dialog class="news-dialog" bind:this={newsDialog} onclose={dismissNews}>
		<h2>Neu seit deinem letzten Besuch</h2>
		{#each data.news as g (g.title)}
			<h3>{g.title}</h3>
			<ul>{#each g.texts as text (text)}<li>{text}</li>{/each}</ul>
		{/each}
		<form method="dialog"><button class="btn btn-primary" type="submit">Verstanden</button></form>
	</dialog>
{/if}
<main class="container">
	{#if othersHere.length}
		<p class="live-bar no-print" aria-live="polite"><span class="live-dot" aria-hidden="true"></span>{othersHere.join(', ')} {othersHere.length === 1 ? 'ist' : 'sind'} auch auf dieser Seite</p>
	{/if}
	{@render children()}
</main>
