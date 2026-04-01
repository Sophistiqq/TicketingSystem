<script lang="ts">
  import auth from "../auth.svelte";
</script>

<a href="/home">Home</a>
<a href="/login">Login</a>
<button onclick={() => auth.logout()}> Lougout </button>
