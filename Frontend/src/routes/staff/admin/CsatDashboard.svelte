<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "../../../lib/api";
  import type { CSATStats } from "../../../lib/types";
  import { Star, TrendingUp, Users, ChartColumn, Clock } from "lucide-svelte";
  import StatsCard from "../../../components/StatsCard.svelte";

  let stats = $state<CSATStats | null>(null);
  let loading = $state(true);
  let startDate = $state("");
  let endDate = $state("");

  onMount(() => loadStats());

  async function loadStats() {
    loading = true;
    const params = new URLSearchParams();
    if (startDate) params.set("start_date", startDate);
    if (endDate) params.set("end_date", endDate);

    try {
      const res = await api.get<CSATStats>(`/csat/stats?${params}`);
      if (res) stats = res;
    } catch {
      /* handled */
    }
    loading = false;
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
    <p class="text-sm opacity-60 mt-1">Advanced Customer Satisfaction Analytics</p>
  </div>

  <!-- Filters -->
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
    <!-- Key Metrics -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
      <StatsCard icon={Star} label="Avg Rating" value={stats.average_rating.toFixed(1)} sub="out of 5.0" color="warning" />
      <StatsCard icon={Users} label="Responses" value={stats.total_responses} color="info" />
      <StatsCard icon={Clock} label="SLA Met Avg" value={stats.sla_impact.met.toFixed(1)} sub="vs breached ({stats.sla_impact.breached.toFixed(1)})" color="success" />
      <StatsCard icon={TrendingUp} label="Satisfaction" value={`${Math.round(((stats.distribution[4] + stats.distribution[5]) / stats.total_responses) * 100)}%`} sub="4-5 stars" color="success" />
    </div>

    <!-- Leaderboard & Distribution -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="card bg-base-100 shadow-sm border border-base-300">
        <div class="card-body p-5">
          <h2 class="card-title text-sm mb-4">Agent Performance Leaderboard</h2>
          <div class="flex flex-col gap-2">
            {#each stats.agent_leaderboard as agent}
              <div class="flex justify-between items-center p-2 bg-base-200 rounded">
                <span class="font-medium text-sm">{agent.name}</span>
                <span class="font-bold text-primary">{agent.average.toFixed(1)} <Star size={12} class="inline text-warning" /></span>
              </div>
            {:else}
              <p class="text-xs opacity-50">Not enough data for leaderboard.</p>
            {/each}
          </div>
        </div>
      </div>

      <div class="card bg-base-100 shadow-sm border border-base-300">
        <div class="card-body p-5">
          <h2 class="card-title text-sm mb-4">Rating Distribution</h2>
          <div class="flex flex-col gap-2">
            {#each [5, 4, 3, 2, 1] as r}
              <div class="flex items-center gap-2 text-xs">
                <span class="w-8">{r} ★</span>
                <div class="flex-1 h-3 bg-base-300 rounded overflow-hidden">
                  <div class="{ratingColor(r)} h-full" style="width: {stats.total_responses > 0 ? (stats.distribution[r] / stats.total_responses) * 100 : 0}%"></div>
                </div>
                <span class="w-12 text-right">{stats.distribution[r]}</span>
              </div>
            {/each}
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
