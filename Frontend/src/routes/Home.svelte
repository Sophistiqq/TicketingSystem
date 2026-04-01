<script lang="ts">
  import auth from "../auth.svelte";
  import Nav from "../components/Nav.svelte";
</script>

<Nav />

<button
  class="btn btn-neutral"
  onclick={() => {
    auth.logout();
  }}>Logout</button
>
