<script lang="ts">
  import { Router } from "sv-router";
  import "./router.svelte";
  import { getCurrentUser } from "./stores/user.svelte";
  import {
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    CircleUser,
    House,
    Minus,
    Pencil,
    Plus,
  } from "lucide-svelte";

  type NavItem = {
    icon: typeof ChevronDown;
    label: string;
    href?: string;
    badge?: number;
    sublinks?: NavItem[];
  };

  let navitems: NavItem[] = [
    { icon: House, label: "Home", href: "/" },
    {
      icon: ChevronDown,
      label: "Options",
      sublinks: [
        { icon: Pencil, label: "Sublink 1" },
        {
          icon: ChevronRight,
          label: "Sublink 2",
          sublinks: [
            { icon: ChevronRight, label: "Sublink 2.1", badge: 20 },
            { icon: ChevronRight, label: "Sublink 2.2" },
          ],
        },
      ],
    },
  ];

  let drawerOpen = $state(false);
  let user = $derived(getCurrentUser());

  const MIN_REM = 12;
  const MAX_REM = 30;
  let drawerWidthRem = $state(15);
  let isResizing = $state(false);

  function onResizeStart(e: MouseEvent) {
    if (!drawerOpen) return;
    isResizing = true;
    e.preventDefault();

    function onMove(e: MouseEvent) {
      const rem = parseFloat(
        getComputedStyle(document.documentElement).fontSize,
      );
      const newWidth = e.clientX / rem;
      drawerWidthRem = Math.min(MAX_REM, Math.max(MIN_REM, newWidth));
    }

    function onUp() {
      isResizing = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }
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
      <aside
        class="drawer"
        class:collapsed={!drawerOpen}
        class:resizing={isResizing}
        style="--drawer-width: {drawerWidthRem}rem"
      >
        <nav>
          {@render navcontents(navitems, 0)}
        </nav>
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div
          class="resize-handle"
          role="separator"
          aria-label="Resize sidebar"
          onmousedown={onResizeStart}
        ></div>
      </aside>
    {/if}

    <main>
      <Router />
    </main>
  </div>
</div>

{#snippet navcontents(items: NavItem[], depth: number)}
  {#each items as item}
    {#if item.sublinks}
      <details>
        <summary style="padding-left: {0.5 + depth * 0.75}rem">
          <item.icon size={16} />
          <span class="label">{item.label}</span>
          <Plus class="chevron chevron-closed" size={13} opacity={0.5} />
          <Minus class="chevron chevron-open" size={13} opacity={0.5} />
        </summary>
        <div class="sublinks">
          {@render navcontents(item.sublinks, depth + 1)}
        </div>
      </details>
    {:else}
      <a href={item.href} style="padding-left: {0.5 + depth * 0.75}rem">
        <item.icon size={16} />
        <span class="label">{item.label}</span>
        {#if item.badge}
          <span class="badge">{item.badge}</span>
        {/if}
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
    font-size: 1rem;
  }

  header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0 1rem;
    height: 3.5rem;
    border-bottom: 1px solid #ccc;
    z-index: 10;
    flex-shrink: 0;

    .title {
      flex: 1;
      font-size: 1.125rem;
      font-weight: 600;
      margin: 0;
    }
  }

  .body {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  aside.drawer {
    position: relative;
    display: flex;
    flex-direction: column;
    width: var(--drawer-width, 15rem);
    height: 100%;
    border-right: 1px solid #ccc;
    overflow: hidden;
    transition: width 0.2s ease;
    z-index: 9;
    flex-shrink: 0;

    &.resizing {
      transition: none;
    }

    &.collapsed {
      width: 3rem;

      .label {
        display: none;
      }

      .resize-handle {
        display: none;
      }

      /* hide badges */
      :global(nav a .badge) {
        display: none;
      }

      /* hide sublink icons - only show top-level icons */
      .sublinks {
        display: none;
      }

      nav a,
      nav summary {
        padding-left: 0.5rem;
        padding-right: 0.5rem;
        justify-content: center;
      }

      nav summary :global(svg) {
        display: none;
      }
    }

    &.collapsed:hover {
      width: var(--drawer-width, 15rem);

      .label {
        display: inline;
      }

      :global(nav a .badge) {
        display: flex;
      }

      .sublinks {
        display: flex;
      }

      nav a,
      nav summary {
        padding-left: revert;
        padding-right: 0.75rem;
        justify-content: flex-start;
      }

      nav summary :global(svg) {
        display: block;
      }
    }
  }

  nav {
    display: flex;
    flex-direction: column;
    padding: 0.5rem;
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }

  nav a,
  nav summary {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    padding-right: 0.75rem;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    white-space: nowrap;
    cursor: pointer;
    text-decoration: none;
    color: inherit;
    list-style: none;

    &:hover {
      background: #f3f4f6;
    }
  }

  nav summary {
    .label {
      flex: 1; /* pushes chevron to the far right */
    }

    &::marker,
    &::-webkit-details-marker {
      display: none;
    }
  }

  .sublinks {
    display: flex;
    flex-direction: column;
  }

  .resize-handle {
    position: absolute;
    top: 0;
    right: 0;
    width: 0.25rem;
    height: 100%;
    cursor: col-resize;
    background: transparent;
    transition: background 0.15s;

    &:hover {
      background: #6366f1;
    }
  }

  main {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
  }

  #drawer-toggle {
    border: none;
    background: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem;
    border-radius: 0.375rem;

    &:hover {
      background: #f3f4f6;
    }
  }

  /* show/hide plus-minus based on open state */
  :global(details .chevron-open) {
    display: none;
  }
  :global(details .chevron-closed) {
    display: block;
  }
  :global(details[open] .chevron-open) {
    display: block;
  }
  :global(details[open] .chevron-closed) {
    display: none;
  }

  aside.drawer.collapsed:not(:hover) :global(nav summary svg) {
    display: none;
  }

  .badge {
    margin-left: auto;
    background: #1f2937;
    color: #fff;
    font-size: 0.7rem;
    font-weight: 600;
    padding: 0.125rem 0.4rem;
    border-radius: 999px;
    min-width: 1.25rem;
    text-align: center;
  }
</style>
