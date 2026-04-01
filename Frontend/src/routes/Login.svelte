<script lang="ts">
  import auth from "../auth.svelte";

  let username = $state("");
  let password = $state("");
</script>

<div
  class="container flex flex-col items-center justify-center w-full h-screen"
>
  <form
    class="fieldset bg-base-200 border-base-300 rounded-box w-xs border p-4"
    onsubmit={(e: Event) => {
      e.preventDefault();
      auth.login(username, password);
    }}
  >
    <fieldset class="fieldset">
      <label class="label" for="username">Username</label>
      <input
        type="text"
        class="input validator"
        placeholder="Username"
        required
        id="username"
        bind:value={username}
      />
      <p class="validator-hint hidden">Required</p>
    </fieldset>

    <label class="fieldset">
      <span class="label">Password</span>
      <input
        type="password"
        class="input validator"
        placeholder="Password"
        required
        bind:value={password}
      />
      <span class="validator-hint hidden">Required</span>
    </label>

    <button class="btn btn-neutral mt-4" type="submit">Login</button>
  </form>
</div>
