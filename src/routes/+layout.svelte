<script lang="ts">
	import '../app.css';

	let { children } = $props();
</script>

<svelte:head>
	<title>Gemeindeplan</title>
</svelte:head>

{@render children()}
