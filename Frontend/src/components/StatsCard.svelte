<script lang="ts">
  let { icon: Icon, label, value, color, sub, pct } = $props<{
    icon: any;
    label: string;
    value: string | number;
    color: "primary" | "secondary" | "accent" | "info" | "success" | "warning" | "error" | "neutral";
    sub?: string;
    pct?: number; // Optional percentage for a progress indicator
  }>();

  const colorClasses: Record<string, string> = {
    primary: "text-primary",
    secondary: "text-secondary",
    accent: "text-accent",
    info: "text-info",
    success: "text-success",
    warning: "text-warning",
    error: "text-error",
    neutral: "text-neutral-content"
  };

  const bgClasses: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    secondary: "bg-secondary/10 text-secondary",
    accent: "bg-accent/10 text-accent",
    info: "bg-info/10 text-info",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
    error: "bg-error/10 text-error",
    neutral: "bg-neutral text-neutral-content"
  };
</script>

<div class="stat group transition-all hover:bg-base-300/30">
  <div class="stat-figure">
    <div class="p-3 rounded-2xl transition-transform group-hover:scale-110 {bgClasses[color]}">
      <Icon class="size-6 sm:size-7" />
    </div>
  </div>
  
  <div class="stat-title text-[10px] sm:text-xs lg:text-[11px] xl:text-xs font-bold uppercase tracking-widest opacity-50 leading-tight mb-1">{label}</div>
  <div class="stat-value text-xl sm:text-2xl xl:text-3xl font-black {colorClasses[color]}">{value}</div>
  
  {#if pct !== undefined}
    <div class="stat-desc mt-2 flex flex-col gap-1.5">
      <progress class="progress progress-{color} h-1.5 w-full" value={pct} max="100"></progress>
      <div class="flex justify-between items-center text-[10px] font-medium opacity-60">
        <span>{sub ?? 'Completion'}</span>
        <span>{pct}%</span>
      </div>
    </div>
  {:else if sub}
    <div class="stat-desc text-[10px] sm:text-xs truncate font-medium opacity-60 mt-1">
      {sub}
    </div>
  {/if}
</div>
