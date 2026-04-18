<script lang="ts">
  import { getModalState, closeModal } from "../stores/ui.svelte";

  let modal = $derived(getModalState());
  let inputValue = $state("");

  // Sync inputValue when modal opens
  $effect(() => {
    if (modal?.show && modal.options.withInput) {
      inputValue = modal.options.defaultValue ?? "";
    }
  });

  function handleConfirm() {
    closeModal(true, modal?.options.withInput ? inputValue : undefined);
  }

  function handleCancel() {
    closeModal(false);
  }
</script>

{#if modal?.show}
  <div class="modal modal-open z-100">
    <div class="modal-box">
      <h3 class="text-lg font-bold">
        {modal.options.title ?? (modal.options.withInput ? "Input Required" : "Confirm Action")}
      </h3>
      <p class="py-4 whitespace-pre-wrap">{modal.options.message}</p>
      
      {#if modal.options.withInput}
        <div class="form-control w-full">
          <input 
            type="text" 
            class="input input-bordered w-full" 
            placeholder={modal.options.placeholder ?? "Enter value..."}
            bind:value={inputValue}
            onkeydown={(e) => e.key === 'Enter' && handleConfirm()}
          />
        </div>
      {/if}

      <div class="modal-action">
        <button class="btn btn-ghost" onclick={handleCancel}>
          {modal.options.cancelText ?? "Cancel"}
        </button>
        <button 
          class="btn {modal.options.destructive ? 'btn-error' : 'btn-primary'}" 
          onclick={handleConfirm}
        >
          {modal.options.confirmText ?? "Confirm"}
        </button>
      </div>
    </div>
    <button class="modal-backdrop" onclick={handleCancel}>close</button>
  </div>
{/if}
