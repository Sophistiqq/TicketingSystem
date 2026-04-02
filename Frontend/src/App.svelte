<script lang="ts">
  import { Router } from "sv-router";
  import "./router.svelte";
  import { getCurrentUser } from "./stores/user.svelte";
  import {
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    CircleUser,
  } from "lucide-svelte";

  type NavItem = {
    icon: typeof ChevronDown;
    label: string;
    href?: string;
    sublinks?: NavItem[];
  };

  let navitems: NavItem[] = [
    { icon: ChevronLeft, label: "Home" },
    {
      icon: ChevronDown,
      label: "Options",
      sublinks: [
        { icon: ChevronRight, label: "Sublink 1" },
        {
          icon: ChevronRight,
          label: "Sublink 2",
          sublinks: [
            { icon: ChevronRight, label: "Sublink 2.1" },
            { icon: ChevronRight, label: "Sublink 2.2" },
          ],
        },
      ],
    },
  ];

  let drawerOpen = $state(false);
  let user = $derived(getCurrentUser());
</script>

<div class="layout">
  <header>
    {#if user}
      <button id="drawer-toggle" onclick={() => (drawerOpen = !drawerOpen)}>
        {#if drawerOpen}
          <ChevronLeft />
        {:else}
          <ChevronRight />
        {/if}
      </button>
    {/if}
    <h1 class="title">Ticketing?</h1>

    {#if user}
      <CircleUser />
    {/if}
  </header>

  <div class="body">
    {#if user}
      <aside class="drawer" class:collapsed={!drawerOpen}>
        <nav>
          {@render navcontents(navitems)}
        </nav>
      </aside>
    {/if}

    <main>
      <Router />
    </main>
  </div>
</div>

{#snippet navcontents(items: NavItem[])}
  {#each items as item}
    {#if item.sublinks}
      <details>
        <summary>
          <item.icon />
          <span class="label">{item.label}</span>
        </summary>
        <div class="sublinks">
          {@render navcontents(item.sublinks)}
        </div>
      </details>
    {:else}
      <a href={item.href}>
        <item.icon />
        <span class="label">{item.label}</span>
      </a>
    {/if}
  {/each}
{/snippet}

<style>
  .layout {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
  }

  header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0 1rem;
    border-bottom: 1px solid #ccc;
    z-index: 10;

    .title {
      flex: 1;
    }
  }

  .body {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  aside.drawer {
    display: flex;
    flex-direction: column;
    width: 240px;
    height: 100%;
    border-right: 1px solid #ccc;
    overflow: hidden;
    transition: width 0.2s ease;
    z-index: 9;

    &.collapsed {
      width: 3rem;

      /* hide labels and summary text, keep icons */
      .label {
        display: none;
      }
    }

    &.collapsed:hover {
      width: 240px;

      .label {
        display: inline;
      }
    }
  }

  nav {
    display: flex;
    flex-direction: column;
    padding: 0.5rem;
    flex: 1;
    overflow-y: auto;
  }

  nav a,
  nav summary {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    white-space: nowrap;
  }

  main {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
  }

  .sublinks {
    display: flex;
    flex-direction: column;
  }

  #drawer-toggle {
    border: none;
    background: none;
    cursor: pointer;
  }
</style>
