<script lang="ts">
  import { Search, ChevronDown, X } from "lucide-svelte";

  interface Item {
    id: number;
    name: string;
  }

  let {
    items = [],
    value = $bindable<number | undefined>(undefined),
    placeholder = "Select...",
    label = "",
    icon: Icon = undefined,
    disabled = false,
  } = $props();

  let searchQuery = $state("");
  let isOpen = $state(false);

  let filteredItems = $derived(
    searchQuery.trim() === ""
      ? items
      : items.filter((item) =>
          item.name.toLowerCase().includes(searchQuery.toLowerCase()),
        ),
  );

  let selectedItem = $derived(items.find((item) => item.id === value));

  function selectItem(item: Item) {
    value = item.id;
    searchQuery = "";
    isOpen = false;
  }

  function clear() {
    value = undefined;
    searchQuery = "";
  }

  // Handle "Others" logic if user types something that doesn't match
  // This is a bit tricky, maybe we just want to expose a way to set "Others"
  // If user types and doesn't select anything, we can hint to use "Others"
  let showOthersHint = $derived(
    searchQuery.length > 2 &&
      filteredItems.length === 0 &&
      !items.find((i) => i.name === "Others"),
  );

  // If there's an item named "Others", we find it
  let othersItem = $derived(
    items.find((i) => i.name.toLowerCase() === "others"),
  );
</script>

<div class="form-control w-full relative">
  {#if label}
    <label class="label font-bold text-xs uppercase gap-2 px-1" for="searchable-select">
      {#if Icon}<Icon size={14} class="opacity-60" />{/if}
      {label}
    </label
    >
  {/if}

  <div class="relative group">
    <div
      class="input input-bordered w-full flex items-center gap-2 cursor-text bg-base-100 {disabled
        ? 'input-disabled'
        : ''} {isOpen ? 'border-primary ring-1 ring-primary' : ''}"
      onclick={() => !disabled && (isOpen = !isOpen)}
      onkeydown={(e) => e.key === "Enter" && !disabled && (isOpen = !isOpen)}
      role="combobox"
      aria-expanded={isOpen}
      aria-haspopup="listbox"
      tabindex="0"
    >
      <Search size={14} class="opacity-40" />

      {#if selectedItem && !isOpen}
        <span class="flex-1 truncate">{selectedItem.name}</span>
      {:else}
        <input
          id="searchable-select"
          type="text"
          class="flex-1 bg-transparent border-none outline-none text-sm p-0 h-full"
          {placeholder}
          bind:value={searchQuery}
          onfocus={() => (isOpen = true)}
          oninput={() => (isOpen = true)}
          {disabled}
        />
      {/if}

      {#if value !== undefined}
        <button
          type="button"
          class="btn btn-ghost btn-xs btn-circle"
          onclick={(e) => {
            e.stopPropagation();
            clear();
          }}
          {disabled}
        >
          <X size={14} />
        </button>
      {:else}
        <ChevronDown
          size={14}
          class="opacity-40 transition-transform {isOpen ? 'rotate-180' : ''}"
        />
      {/if}
    </div>

    {#if isOpen}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="fixed inset-0 z-10" onclick={() => (isOpen = false)}></div>

      <ul
        id="select-options"
        class="absolute z-20 top-full left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-base-100 border border-base-300 rounded-lg shadow-xl p-1 animate-in fade-in slide-in-from-top-2 duration-200"
      >
        {#each filteredItems as item}
          <li>
            <button
              type="button"
              class="w-full text-left px-3 py-2 rounded-md hover:bg-base-200 transition-colors flex items-center justify-between {value ===
              item.id
                ? 'bg-primary/10 text-primary font-bold'
                : ''}"
              onclick={() => selectItem(item)}
            >
              <span class="truncate">{item.name}</span>
              {#if value === item.id}
                <div class="w-1.5 h-1.5 rounded-full bg-primary"></div>
              {/if}
            </button>
          </li>
        {:else}
          <li class="px-3 py-4 text-center">
            <p class="text-xs opacity-50 mb-2">No matching results found</p>
            {#if othersItem}
              <button
                type="button"
                class="btn btn-xs btn-outline btn-primary w-full"
                onclick={() => selectItem(othersItem!)}
              >
                Use "Others"
              </button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>
