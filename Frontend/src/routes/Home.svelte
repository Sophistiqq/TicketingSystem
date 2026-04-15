<script lang="ts">
  // This file is kept for backward compatibility.
  // The main dashboard is now at /routes/Dashboard.svelte
  import { navigate } from "../router.svelte";
  import { onMount } from "svelte";

  onMount(() => {
    navigate("/");
  });
</script>
