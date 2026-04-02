<script lang="ts">
  import auth from "../auth.svelte";
</script>

<button
  class="btn btn-neutral"
  onclick={() => {
    auth.logout();
  }}>Logout</button
>
