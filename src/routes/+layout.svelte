<script lang="ts">
	import '../app.css';

	let { children } = $props();
</script>

<svelte:head>
	<title>Pulpit</title>
</svelte:head>

{@render children()}
