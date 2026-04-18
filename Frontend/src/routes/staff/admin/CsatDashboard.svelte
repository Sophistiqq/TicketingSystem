<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "../../../lib/api";
  import type { CSATStats, CSAT, PaginatedResponse } from "../../../lib/types";
  import { Star, TrendingUp, Users, BarChart3 } from "lucide-svelte";
  import StatsCard from "../../../components/StatsCard.svelte";

  let stats = $state<CSATStats | null>(null);
  let loading = $state(true);
  let startDate = $state("");
  let endDate = $state("");

  onMount(() => loadStats());

  async function loadStats() {
    loading = true;
    const params = new URLSearchParams();
    if (startDate) params.set("start_date", new Date(startDate).toISOString());
    if (endDate) params.set("end_date", new Date(endDate).toISOString());

    try {
      const res = await api.get<CSATStats>(`/csat/stats?${params}`);
      if (res) stats = res;
    } catch { /* handled */ }
    loading = false;
  }

  function ratingLabel(n: number): string {
    const labels: Record<number, string> = {
      1: "Very Poor",
      2: "Poor",
      3: "Average",
      4: "Good",
      5: "Excellent",
    };
    return labels[n] ?? String(n);
  }

  function ratingColor(n: number): string {
    if (n >= 4) return "bg-success";
    if (n === 3) return "bg-warning";
    return "bg-error";
  }
</script>

<div class="flex flex-col gap-6">
  <div>
    <h1 class="text-3xl font-bold">CSAT Dashboard</h1>
    <p class="text-sm opacity-60 mt-1">Customer Satisfaction metrics</p>
  </div>

  <!-- Date filter -->
  <div class="card bg-base-200 p-4">
    <div class="flex flex-wrap items-end gap-3">
      <fieldset class="fieldset">
        <label class="label text-xs" for="csat-start">Start Date</label>
        <input id="csat-start" type="date" class="input input-bordered input-sm" bind:value={startDate} />
      </fieldset>
      <fieldset class="fieldset">
        <label class="label text-xs" for="csat-end">End Date</label>
        <input id="csat-end" type="date" class="input input-bordered input-sm" bind:value={endDate} />
      </fieldset>
      <button class="btn btn-primary btn-sm" onclick={loadStats}>Apply</button>
      <button class="btn btn-ghost btn-sm" onclick={() => { startDate = ""; endDate = ""; loadStats(); }}>Clear</button>
    </div>
  </div>

  {#if loading}
    <div class="flex justify-center py-20">
      <span class="loading loading-spinner loading-lg text-primary"></span>
    </div>
  {:else if stats}
    <!-- Stats cards -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <StatsCard
        icon={Star}
        label="Average Rating"
        value={stats.average_rating ? stats.average_rating.toFixed(1) : "—"}
        sub="out of 5.0"
        color="warning"
      />
      <StatsCard
        icon={Users}
        label="Total Responses"
        value={stats.total_responses}
        color="info"
      />
      <StatsCard
        icon={TrendingUp}
        label="Satisfaction Rate"
        value={stats.total_responses > 0
          ? `${Math.round(((stats.distribution?.[4] ?? 0) + (stats.distribution?.[5] ?? 0)) / stats.total_responses * 100)}%`
          : "—"}
        sub="rated 4 or 5"
        color="success"
      />
    </div>

    <!-- Rating distribution -->
    <div class="card bg-base-200 shadow-sm">
      <div class="card-body p-5">
        <h2 class="card-title text-lg mb-4">Rating Distribution</h2>
        <div class="flex flex-col gap-3">
          {#each [5, 4, 3, 2, 1] as rating}
            {@const count = stats.distribution?.[rating] ?? 0}
            {@const pct = stats.total_responses > 0 ? (count / stats.total_responses) * 100 : 0}
            <div class="flex items-center gap-3">
              <div class="flex items-center gap-1 w-24 shrink-0">
                {#each Array(rating) as _}
                  <Star size={14} fill="currentColor" class="text-warning" />
                {/each}
              </div>
              <div class="flex-1 bg-base-300 rounded-full h-4 overflow-hidden">
                <div class="{ratingColor(rating)} h-full rounded-full transition-all duration-500" style="width: {pct}%"></div>
              </div>
              <span class="text-sm font-mono w-16 text-right">{count} ({pct.toFixed(0)}%)</span>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {:else}
    <div class="card bg-base-200 shadow-sm">
      <div class="card-body items-center text-center py-16">
        <BarChart3 size={48} class="opacity-20 mb-2" />
        <h2 class="text-lg font-semibold opacity-60">No data</h2>
        <p class="text-sm opacity-40">No CSAT responses in the selected period.</p>
      </div>
    </div>
  {/if}
</div>
