<script lang="ts">
  let { icon: Icon, label, value, color, sub } = $props<{
    icon: any;
    label: string;
    value: string | number;
    color: "primary" | "secondary" | "accent" | "info" | "success" | "warning" | "error";
    sub?: string;
  }>();
</script>

<div class="card bg-base-200 shadow-sm">
  <div class="card-body p-4 flex-row items-center gap-4">
    <div class="bg-{color}/10 text-{color} w-12 h-12 rounded-xl flex items-center justify-center shrink-0">
      <Icon size={24} />
    </div>
    <div class="min-w-0">
      <p class="text-2xl font-bold leading-none">{value}</p>
      <p class="text-sm opacity-60 mt-0.5">{label}</p>
      {#if sub}
        <p class="text-xs opacity-40">{sub}</p>
      {/if}
    </div>
  </div>
</div>
