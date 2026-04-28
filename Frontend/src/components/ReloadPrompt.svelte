<script lang="ts">
  import { useRegisterSW } from 'virtual:pwa-register/svelte';
  import { RefreshCw, X } from 'lucide-svelte';

  const { needRefresh, updateServiceWorker } = useRegisterSW({
    onRegistered(r) {
      console.log('[PWA] Service Worker registered');
    },
    onRegisterError(error) {
      console.error('[PWA] Service Worker registration error:', error);
    }
  });

  function close() {
    $needRefresh = false;
  }
</script>

{#if $needRefresh}
  <div class="toast toast-bottom toast-center z-[100] w-full max-w-md p-4">
    <div class="alert alert-info shadow-lg flex flex-col sm:flex-row justify-between items-center gap-4">
      <div class="flex items-center gap-3">
        <div class="bg-primary/20 p-2 rounded-full text-primary">
          <RefreshCw size={20} class="animate-spin-slow" />
        </div>
        <div class="flex flex-col">
          <span class="font-bold text-sm">Update Available</span>
          <span class="text-xs opacity-80">New features and fixes are ready.</span>
        </div>
      </div>
      <div class="flex items-center gap-2 w-full sm:w-auto">
        <button 
          class="btn btn-primary btn-sm flex-1 sm:flex-none" 
          onclick={() => updateServiceWorker(true)}
        >
          Update Now
        </button>
        <button 
          class="btn btn-ghost btn-sm btn-square" 
          onclick={close}
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  :global(.animate-spin-slow) {
    animation: spin 8s linear infinite;
  }
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
</style>
