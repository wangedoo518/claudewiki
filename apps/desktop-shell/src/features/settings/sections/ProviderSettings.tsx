import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Download,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  deleteManagedProvider,
  getManagedProviders,
  getOpenclawRuntime,
  getProviderPresets,
  importLiveProviders,
  syncManagedProvider,
  testManagedProviderConnection,
  updateOpenclawEnv,
  updateOpenclawTools,
  upsertManagedProvider,
  type DesktopCustomizeState,
  type DesktopManagedProvider,
  type DesktopOpenclawRuntimeState,
  type DesktopProviderConnectionTestResult,
  type DesktopProviderModel,
  type DesktopProviderPreset,
} from "@/lib/tauri";

const DRAFT_PROVIDER_ID = "__draft__";
const CATEGORY_OPTIONS = [
  { value: "all", label: "All" },
  { value: "official", label: "Official" },
  { value: "cn_official", label: "CN Official" },
  { value: "aggregator", label: "Aggregator" },
  { value: "custom", label: "Custom" },
  { value: "imported", label: "Imported" },
] as const;
const PROTOCOL_OPTIONS = [
  { value: "openai-completions", label: "OpenAI Completions" },
  { value: "openai-responses", label: "OpenAI Responses" },
  { value: "anthropic-messages", label: "Anthropic Messages" },
  { value: "google-generative-ai", label: "Google Generative AI" },
] as const;

interface ProviderSettingsProps {
  customize: DesktopCustomizeState | null;
  error?: string;
}

interface EditableProvider {
  id?: string;
  is_new: boolean;
  name: string;
  category: string;
  provider_type: string;
  billing_category: string;
  protocol: string;
  base_url: string;
  api_key: string;
  enabled: boolean;
  official_verified: boolean;
  preset_id?: string | null;
  website_url: string;
  description: string;
  models: EditableProviderModel[];
}

interface EditableProviderModel {
  model_id: string;
  display_name: string;
  context_window: string;
  max_output_tokens: string;
  billing_kind: string;
  capability_tags: string;
}

interface Notice {
  tone: "info" | "success" | "error";
  message: string;
}

type BusyAction =
  | "save"
  | "sync"
  | "sync-default"
  | "delete"
  | "import"
  | "save-env"
  | "save-tools"
  | "test-connection"
  | null;

export function ProviderSettings({ customize, error }: ProviderSettingsProps) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditableProvider | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [connectionTestResult, setConnectionTestResult] =
    useState<DesktopProviderConnectionTestResult | null>(null);
  const [envDraft, setEnvDraft] = useState("");
  const [toolsDraft, setToolsDraft] = useState("{}");
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const previousRuntimeEnvRef = useRef("");
  const previousRuntimeToolsRef = useRef("{}");

  const presetsQuery = useQuery({
    queryKey: ["provider-presets"],
    queryFn: async () => (await getProviderPresets()).presets,
    refetchOnWindowFocus: false,
  });

  const providersQuery = useQuery({
    queryKey: ["managed-providers"],
    queryFn: async () => (await getManagedProviders()).providers,
    refetchOnWindowFocus: false,
  });

  const runtimeQuery = useQuery({
    queryKey: ["openclaw-runtime"],
    queryFn: async () => (await getOpenclawRuntime()).runtime,
    refetchOnWindowFocus: false,
  });

  const managedProviders = providersQuery.data ?? [];
  const providerMap = useMemo(
    () => new Map(managedProviders.map((provider) => [provider.id, provider])),
    [managedProviders]
  );
  const selectedProvider =
    selectedProviderId && selectedProviderId !== DRAFT_PROVIDER_ID
      ? (providerMap.get(selectedProviderId) ?? null)
      : null;
  const runtime = runtimeQuery.data ?? null;
  const runtimeEnvText = useMemo(() => serializeEnvMap(runtime?.env ?? {}), [runtime?.env]);
  const runtimeToolsText = useMemo(
    () => serializeToolsObject(runtime?.tools ?? {}),
    [runtime?.tools]
  );

  useEffect(() => {
    if (selectedProviderId === DRAFT_PROVIDER_ID) return;
    if (selectedProviderId && providerMap.has(selectedProviderId)) {
      const provider = providerMap.get(selectedProviderId);
      if (provider) {
        setDraft(toEditableProvider(provider));
      }
      return;
    }
    if (managedProviders.length > 0) {
      setSelectedProviderId(managedProviders[0].id);
      setDraft(toEditableProvider(managedProviders[0]));
      return;
    }
    setSelectedProviderId(null);
    setDraft(null);
  }, [managedProviders, providerMap, selectedProviderId]);

  useEffect(() => {
    setEnvDraft((current) =>
      current === "" || current === previousRuntimeEnvRef.current ? runtimeEnvText : current
    );
    previousRuntimeEnvRef.current = runtimeEnvText;
  }, [runtimeEnvText]);

  useEffect(() => {
    setToolsDraft((current) =>
      current === "{}" || current === previousRuntimeToolsRef.current
        ? runtimeToolsText
        : current
    );
    previousRuntimeToolsRef.current = runtimeToolsText;
  }, [runtimeToolsText]);

  useEffect(() => {
    setConnectionTestResult(null);
  }, [draft?.id, draft?.protocol, draft?.base_url, draft?.api_key]);

  const filteredManagedProviders = useMemo(
    () =>
      managedProviders.filter((provider) =>
        matchesProviderSearch(provider, search, categoryFilter)
      ),
    [managedProviders, search, categoryFilter]
  );

  const filteredPresets = useMemo(
    () =>
      (presetsQuery.data ?? []).filter((preset) =>
        matchesPresetSearch(preset, search, categoryFilter)
      ),
    [presetsQuery.data, search, categoryFilter]
  );

  const originalDraft = useMemo(
    () => (selectedProvider ? toEditableProvider(selectedProvider) : null),
    [selectedProvider]
  );
  const isDirty = useMemo(() => {
    if (!draft) return false;
    if (draft.is_new) return true;
    if (!originalDraft) return false;
    return serializeDraft(draft) !== serializeDraft(originalDraft);
  }, [draft, originalDraft]);
  const envDirty = envDraft.trim() !== runtimeEnvText.trim();
  const toolsDirty =
    normalizeJsonText(toolsDraft) !== normalizeJsonText(runtimeToolsText);

  async function refreshProviderData() {
    await Promise.all([providersQuery.refetch(), runtimeQuery.refetch()]);
  }

  async function persistDraft(
    nextDraft: EditableProvider,
    action: "save" | null = "save"
  ) {
    if (action) {
      setBusyAction(action);
    }
    try {
      const response = await upsertManagedProvider(toProviderPayload(nextDraft));
      const provider = response.provider;
      setNotice({
        tone: "success",
        message: `${provider.name} saved to the Warwolf provider hub.`,
      });
      setSelectedProviderId(provider.id);
      setDraft(toEditableProvider(provider));
      await refreshProviderData();
      return provider;
    } catch (saveError) {
      const message =
        saveError instanceof Error ? saveError.message : "Failed to save provider.";
      setNotice({ tone: "error", message });
      throw saveError;
    } finally {
      if (action) {
        setBusyAction(null);
      }
    }
  }

  async function handleSave() {
    if (!draft) return;
    await persistDraft(draft, "save");
  }

  async function handleSync(setPrimary: boolean) {
    if (!draft) return;
    setBusyAction(setPrimary ? "sync-default" : "sync");
    try {
      const provider =
        draft.is_new || isDirty ? await persistDraft(draft, null) : selectedProvider;
      if (!provider) return;
      const response = await syncManagedProvider(provider.id, {
        set_primary: setPrimary,
      });
      await refreshProviderData();
      setNotice({
        tone: "success",
        message: response.result.primary_applied
          ? `Synced ${provider.name} and updated OpenClaw default model to ${response.result.primary_applied}.`
          : `Synced ${provider.name} to OpenClaw.`,
      });
    } catch (syncError) {
      if (syncError instanceof Error) {
        setNotice({ tone: "error", message: syncError.message });
      }
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDelete() {
    if (!selectedProvider) return;
    if (!window.confirm(`Delete provider "${selectedProvider.name}"?`)) return;
    setBusyAction("delete");
    try {
      await deleteManagedProvider(selectedProvider.id);
      setNotice({
        tone: "success",
        message: `${selectedProvider.name} was removed from Warwolf and OpenClaw.`,
      });
      setSelectedProviderId(null);
      setDraft(null);
      await refreshProviderData();
    } catch (deleteError) {
      const message =
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete provider.";
      setNotice({ tone: "error", message });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleImport(providerIds: string[]) {
    setBusyAction("import");
    try {
      const response = await importLiveProviders({
        provider_ids: providerIds,
      });
      await refreshProviderData();
      setIsImportOpen(false);
      const imported = response.providers[0];
      if (imported) {
        setSelectedProviderId(imported.id);
        setDraft(toEditableProvider(imported));
      }
      setNotice({
        tone: "success",
        message: `Imported ${response.providers.length} provider(s) from OpenClaw live config.`,
      });
    } catch (importError) {
      const message =
        importError instanceof Error
          ? importError.message
          : "Failed to import live providers.";
      setNotice({ tone: "error", message });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSaveEnv() {
    setBusyAction("save-env");
    try {
      const parsed = parseEnvDraft(envDraft);
      const response = await updateOpenclawEnv({ env: parsed });
      await runtimeQuery.refetch();
      setNotice({
        tone: "success",
        message: response.result.changed
          ? "OpenClaw env configuration saved."
          : "OpenClaw env configuration was already up to date.",
      });
    } catch (runtimeError) {
      const message =
        runtimeError instanceof Error
          ? runtimeError.message
          : "Failed to save OpenClaw env.";
      setNotice({ tone: "error", message });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSaveTools() {
    setBusyAction("save-tools");
    try {
      const parsed = parseToolsDraft(toolsDraft);
      const response = await updateOpenclawTools({ tools: parsed });
      await runtimeQuery.refetch();
      setNotice({
        tone: "success",
        message: response.result.changed
          ? "OpenClaw tools configuration saved."
          : "OpenClaw tools configuration was already up to date.",
      });
    } catch (runtimeError) {
      const message =
        runtimeError instanceof Error
          ? runtimeError.message
          : "Failed to save OpenClaw tools.";
      setNotice({ tone: "error", message });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleTestConnection() {
    if (!draft) return;
    setBusyAction("test-connection");
    try {
      const response = await testManagedProviderConnection({
        id: draft.is_new ? null : draft.id ?? null,
        protocol: draft.protocol,
        base_url: draft.base_url,
        api_key: draft.api_key.trim() || null,
      });
      setConnectionTestResult(response.result);
    } catch (testError) {
      setConnectionTestResult(null);
      const message =
        testError instanceof Error
          ? testError.message
          : "Failed to test provider connection.";
      setNotice({ tone: "error", message });
    } finally {
      setBusyAction(null);
    }
  }

  function selectExistingProvider(providerId: string) {
    if (selectedProviderId === providerId) return;
    if (isDirty && !window.confirm("Discard unsaved provider changes?")) {
      return;
    }
    setSelectedProviderId(providerId);
  }

  function startDraftFromPreset(preset: DesktopProviderPreset) {
    if (isDirty && !window.confirm("Discard unsaved provider changes?")) {
      return;
    }
    setSelectedProviderId(DRAFT_PROVIDER_ID);
    setDraft(toEditablePreset(preset));
    setIsAddOpen(false);
    setNotice({
      tone: "info",
      message: `Drafted ${preset.name}. Save it before syncing to OpenClaw.`,
    });
  }

  function startEmptyCustomDraft() {
    if (isDirty && !window.confirm("Discard unsaved provider changes?")) {
      return;
    }
    setSelectedProviderId(DRAFT_PROVIDER_ID);
    setDraft(createEmptyCustomDraft());
    setIsAddOpen(false);
    setNotice({
      tone: "info",
      message: "Started a custom provider draft.",
    });
  }

  return (
    <div className="space-y-4">
      <SummaryStrip
        activeModel={customize?.model_label ?? "Unavailable"}
        activeModelId={customize?.model_id ?? "No model detected"}
        managedProviderCount={managedProviders.length}
        liveProviderCount={runtime?.live_provider_ids.length ?? 0}
        presetCount={(presetsQuery.data ?? []).length}
      />

      {(notice || error || providersQuery.error || runtimeQuery.error) && (
        <StatusBanner
          tone={
            notice?.tone ??
            (error || providersQuery.error || runtimeQuery.error ? "error" : "info")
          }
          message={
            notice?.message ??
            error ??
            errorMessage(providersQuery.error) ??
            errorMessage(runtimeQuery.error) ??
            "Provider state updated."
          }
        />
      )}

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-2xl border border-border bg-background">
          <div className="border-b border-border px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Provider Library</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Search channels, inspect managed providers, and create new drafts.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsAddOpen(true)}
              >
                <Plus className="size-4" />
                Add
              </Button>
            </div>
            <div className="mt-4 space-y-3">
              <Input
                placeholder="Search providers, models, or channels..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsImportOpen(true)}
                  disabled={(runtime?.live_providers.length ?? 0) === 0}
                >
                  <Download className="size-4" />
                  Import Live
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void refreshProviderData()}>
                  <RefreshCw className="size-4" />
                  Refresh
                </Button>
              </div>
            </div>
          </div>

          <ScrollArea className="h-[min(72vh,860px)]">
            <div className="space-y-6 px-4 py-4">
              <LibrarySection
                title="Configured"
                description="Saved in Warwolf"
                empty="No managed providers yet."
              >
                {providersQuery.isLoading ? (
                  <LoadingBlock label="Loading providers..." />
                ) : (
                  filteredManagedProviders.map((provider) => (
                    <ProviderLibraryItem
                      key={provider.id}
                      label={provider.name}
                      description={provider.base_url}
                      active={selectedProviderId === provider.id}
                      badges={providerBadges(provider, runtime)}
                      onClick={() => selectExistingProvider(provider.id)}
                    />
                  ))
                )}
              </LibrarySection>

              <LibrarySection
                title="Catalog"
                description="Reference presets from clawhub123"
                empty="No presets match the current filter."
              >
                {presetsQuery.isLoading ? (
                  <LoadingBlock label="Loading presets..." />
                ) : (
                  filteredPresets.map((preset) => (
                    <ProviderLibraryItem
                      key={preset.id}
                      label={preset.name}
                      description={preset.base_url}
                      active={false}
                      badges={[formatCategory(preset.category)]}
                      onClick={() => startDraftFromPreset(preset)}
                      actionLabel="Draft"
                    />
                  ))
                )}
              </LibrarySection>

              <div className="rounded-xl border border-dashed border-border p-3">
                <div className="text-sm font-medium text-foreground">Custom provider</div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Start from a blank OpenAI-compatible draft when your channel does not exist in
                  the preset catalog yet.
                </p>
                <Button
                  className="mt-3 w-full"
                  variant="outline"
                  onClick={startEmptyCustomDraft}
                >
                  <Sparkles className="size-4" />
                  New custom draft
                </Button>
              </div>
            </div>
          </ScrollArea>
        </section>

        <section className="rounded-2xl border border-border bg-background p-5">
          {draft ? (
            <div className="space-y-5">
              <div className="flex flex-col gap-4 border-b border-border pb-5 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-xl font-semibold text-foreground">{draft.name || "New Provider"}</h3>
                    {draft.enabled ? (
                      <Badge variant="default">Enabled</Badge>
                    ) : (
                      <Badge variant="secondary">Disabled</Badge>
                    )}
                    {selectedProvider && runtime?.live_provider_ids.includes(selectedProvider.id) ? (
                      <Badge variant="outline">Live</Badge>
                    ) : null}
                    {selectedProvider &&
                    runtime?.default_model.primary?.startsWith(`${selectedProvider.id}/`) ? (
                      <Badge variant="outline">Default</Badge>
                    ) : null}
                    {draft.is_new ? <Badge variant="secondary">Draft</Badge> : null}
                  </div>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                    {draft.description ||
                      "Configure the endpoint, authentication, models, and then sync it into OpenClaw."}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => void handleSave()}
                    disabled={!draft || busyAction !== null}
                  >
                    {busyAction === "save" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Save className="size-4" />
                    )}
                    Save
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void handleSync(false)}
                    disabled={!draft || busyAction !== null}
                  >
                    {busyAction === "sync" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Cloud className="size-4" />
                    )}
                    Sync to OpenClaw
                  </Button>
                  <Button
                    onClick={() => void handleSync(true)}
                    disabled={!draft || busyAction !== null}
                  >
                    {busyAction === "sync-default" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="size-4" />
                    )}
                    Sync & Set Default
                  </Button>
                  {!draft.is_new ? (
                    <Button
                      variant="destructive"
                      onClick={() => void handleDelete()}
                      disabled={busyAction !== null}
                    >
                      {busyAction === "delete" ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                      Delete
                    </Button>
                  ) : null}
                </div>
              </div>

              <SectionCard
                title="Basic Information"
                description="Identity, grouping, and how this provider should appear in the library."
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Name">
                    <Input
                      value={draft.name}
                      onChange={(event) =>
                        setDraftValue(setDraft, "name", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Category">
                    <select
                      className={selectClassName}
                      value={draft.category}
                      onChange={(event) =>
                        setDraftValue(setDraft, "category", event.target.value)
                      }
                    >
                      {CATEGORY_OPTIONS.filter((option) => option.value !== "all").map(
                        (option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        )
                      )}
                    </select>
                  </Field>
                  <Field label="Website URL">
                    <Input
                      value={draft.website_url}
                      onChange={(event) =>
                        setDraftValue(setDraft, "website_url", event.target.value)
                      }
                      placeholder="https://..."
                    />
                  </Field>
                  <Field label="Enabled">
                    <button
                      type="button"
                      className={cn(
                        "inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium transition-colors",
                        draft.enabled
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground"
                      )}
                      onClick={() => setDraftValue(setDraft, "enabled", !draft.enabled)}
                    >
                      {draft.enabled ? "Enabled" : "Disabled"}
                    </button>
                  </Field>
                </div>
                <Field label="Description">
                  <textarea
                    className={textareaClassName}
                    rows={3}
                    value={draft.description}
                    onChange={(event) =>
                      setDraftValue(setDraft, "description", event.target.value)
                    }
                    placeholder="Describe when this provider should be used."
                  />
                </Field>
              </SectionCard>

              <SectionCard
                title="Authentication & Connection"
                description="Provider type, protocol, endpoint, and the credential Warwolf should persist."
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Provider Type">
                    <Input
                      value={draft.provider_type}
                      onChange={(event) =>
                        setDraftValue(setDraft, "provider_type", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Billing Category">
                    <Input
                      value={draft.billing_category}
                      onChange={(event) =>
                        setDraftValue(setDraft, "billing_category", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Protocol">
                    <select
                      className={selectClassName}
                      value={draft.protocol}
                      onChange={(event) =>
                        setDraftValue(setDraft, "protocol", event.target.value)
                      }
                    >
                      {PROTOCOL_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Official Verified">
                    <button
                      type="button"
                      className={cn(
                        "inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium transition-colors",
                        draft.official_verified
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground"
                      )}
                      onClick={() =>
                        setDraftValue(setDraft, "official_verified", !draft.official_verified)
                      }
                    >
                      {draft.official_verified ? "Verified" : "Unverified"}
                    </button>
                  </Field>
                </div>
                <Field label="Base URL">
                  <Input
                    value={draft.base_url}
                    onChange={(event) =>
                      setDraftValue(setDraft, "base_url", event.target.value)
                    }
                    placeholder="https://api.example.com/v1"
                  />
                </Field>
                <Field
                  label="API Key"
                  description={
                    selectedProvider?.api_key_masked && !draft.api_key
                      ? `Existing key: ${selectedProvider.api_key_masked}`
                      : "Leave empty to preserve the current stored key."
                  }
                >
                  <Input
                    value={draft.api_key}
                    onChange={(event) =>
                      setDraftValue(setDraft, "api_key", event.target.value)
                    }
                    placeholder="sk-..."
                  />
                </Field>
                <div className="rounded-xl border border-border bg-background px-4 py-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        Draft connection test
                      </div>
                      <div className="mt-1 text-xs leading-5 text-muted-foreground">
                        Probe the current draft without saving. If this is an existing provider and
                        the API key field is empty, Warwolf reuses the stored key from the provider
                        hub.
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => void handleTestConnection()}
                      disabled={busyAction !== null || !draft.base_url.trim() || !draft.protocol.trim()}
                    >
                      {busyAction === "test-connection" ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <RefreshCw className="size-4" />
                      )}
                      Test Connection
                    </Button>
                  </div>
                  {connectionTestResult ? (
                    <ConnectionTestCard result={connectionTestResult} />
                  ) : null}
                </div>
              </SectionCard>

              <SectionCard
                title="Models"
                description="OpenClaw sync uses these models to populate live providers and the default model catalog."
              >
                <div className="space-y-3">
                  {draft.models.map((modelDraft, index) => (
                    <div
                      key={`${modelDraft.model_id}-${index}`}
                      className="rounded-xl border border-border bg-muted/10 p-4"
                    >
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="text-sm font-medium text-foreground">
                          Model {index + 1}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setDraft((current) =>
                              current
                                ? {
                                    ...current,
                                    models: current.models.filter((_, itemIndex) => itemIndex !== index),
                                  }
                                : current
                            )
                          }
                        >
                          <Trash2 className="size-4" />
                          Remove
                        </Button>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <Field label="Model ID">
                          <Input
                            value={modelDraft.model_id}
                            onChange={(event) =>
                              updateDraftModel(setDraft, index, "model_id", event.target.value)
                            }
                          />
                        </Field>
                        <Field label="Display Name">
                          <Input
                            value={modelDraft.display_name}
                            onChange={(event) =>
                              updateDraftModel(setDraft, index, "display_name", event.target.value)
                            }
                          />
                        </Field>
                        <Field label="Context Window">
                          <Input
                            value={modelDraft.context_window}
                            onChange={(event) =>
                              updateDraftModel(
                                setDraft,
                                index,
                                "context_window",
                                event.target.value
                              )
                            }
                            placeholder="131072"
                          />
                        </Field>
                        <Field label="Max Output Tokens">
                          <Input
                            value={modelDraft.max_output_tokens}
                            onChange={(event) =>
                              updateDraftModel(
                                setDraft,
                                index,
                                "max_output_tokens",
                                event.target.value
                              )
                            }
                            placeholder="8192"
                          />
                        </Field>
                        <Field label="Billing Kind">
                          <Input
                            value={modelDraft.billing_kind}
                            onChange={(event) =>
                              updateDraftModel(setDraft, index, "billing_kind", event.target.value)
                            }
                            placeholder="free / paid"
                          />
                        </Field>
                        <Field label="Capability Tags">
                          <Input
                            value={modelDraft.capability_tags}
                            onChange={(event) =>
                              updateDraftModel(
                                setDraft,
                                index,
                                "capability_tags",
                                event.target.value
                              )
                            }
                            placeholder="general, coding, reasoning"
                          />
                        </Field>
                      </div>
                    </div>
                  ))}
                </div>
                <Button
                  className="mt-4"
                  variant="outline"
                  onClick={() =>
                    setDraft((current) =>
                      current
                        ? {
                            ...current,
                            models: [...current.models, emptyEditableModel()],
                          }
                        : current
                    )
                  }
                >
                  <Plus className="size-4" />
                  Add model
                </Button>
              </SectionCard>

              <SectionCard
                title="OpenClaw Runtime"
                description="Live config summary plus editable env and tools sections."
              >
                <RuntimeSection
                  runtime={runtime}
                  providerId={selectedProvider?.id ?? null}
                  envDraft={envDraft}
                  envDirty={envDirty}
                  onEnvDraftChange={setEnvDraft}
                  toolsDraft={toolsDraft}
                  toolsDirty={toolsDirty}
                  onToolsDraftChange={setToolsDraft}
                  busyAction={busyAction}
                  onSaveEnv={() => void handleSaveEnv()}
                  onSaveTools={() => void handleSaveTools()}
                />
              </SectionCard>

              <SectionCard
                title="Diagnostics"
                description="A quick health summary to reduce ambiguity between saved and live state."
              >
                <DiagnosticsSection runtime={runtime} provider={selectedProvider} />
              </SectionCard>

              {isDirty ? (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-foreground">
                  You have unsaved changes. Save first if you want the library view to reflect them.
                </div>
              ) : null}
            </div>
          ) : (
            <EmptyState
              title="Select a provider or draft a new one"
              body="Browse configured providers on the left, or open the preset catalog to start a new integration."
            />
          )}
        </section>
      </div>

      {isAddOpen ? (
        <AddProviderModal
          presets={presetsQuery.data ?? []}
          onClose={() => setIsAddOpen(false)}
          onSelectPreset={startDraftFromPreset}
          onSelectCustom={startEmptyCustomDraft}
        />
      ) : null}

      {isImportOpen ? (
        <ImportLiveProvidersModal
          busy={busyAction === "import"}
          runtime={runtime}
          onClose={() => setIsImportOpen(false)}
          onImport={handleImport}
        />
      ) : null}
    </div>
  );
}

function SummaryStrip({
  activeModel,
  activeModelId,
  managedProviderCount,
  liveProviderCount,
  presetCount,
}: {
  activeModel: string;
  activeModelId: string;
  managedProviderCount: number;
  liveProviderCount: number;
  presetCount: number;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <SummaryCard label="Runtime Model" value={activeModel} subvalue={activeModelId} />
      <SummaryCard label="Managed Providers" value={String(managedProviderCount)} />
      <SummaryCard label="Live OpenClaw Providers" value={String(liveProviderCount)} />
      <SummaryCard label="Preset Catalog" value={String(presetCount)} />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  subvalue,
}: {
  label: string;
  value: string;
  subvalue?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
      {subvalue ? <div className="mt-1 text-xs text-muted-foreground">{subvalue}</div> : null}
    </div>
  );
}

function StatusBanner({ tone, message }: Notice) {
  const icon =
    tone === "success" ? CheckCircle2 : tone === "error" ? AlertTriangle : Cloud;
  const className =
    tone === "success"
      ? "border-emerald-500/40 bg-emerald-500/10"
      : tone === "error"
        ? "border-destructive/40 bg-destructive/10"
        : "border-border bg-muted/30";
  const Icon = icon;
  return (
    <div className={cn("flex items-start gap-3 rounded-2xl border px-4 py-3", className)}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="text-sm text-foreground">{message}</div>
    </div>
  );
}

function LibrarySection({
  title,
  description,
  empty,
  children,
}: {
  title: string;
  description: string;
  empty: string;
  children: ReactNode;
}) {
  const hasChildren = Array.isArray(children)
    ? children.length > 0
    : Boolean(children);
  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {title}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{description}</div>
      </div>
      {hasChildren ? (
        <div className="space-y-2">{children}</div>
      ) : (
        <div className="rounded-xl border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
          {empty}
        </div>
      )}
    </div>
  );
}

function ProviderLibraryItem({
  label,
  description,
  active,
  badges,
  onClick,
  actionLabel,
}: {
  label: string;
  description: string;
  active: boolean;
  badges: string[];
  onClick: () => void;
  actionLabel?: string;
}) {
  return (
    <button
      className={cn(
        "w-full rounded-xl border px-3 py-3 text-left transition",
        active
          ? "border-primary bg-primary/5"
          : "border-border bg-background hover:border-foreground/20 hover:bg-muted/20"
      )}
      onClick={onClick}
      type="button"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">{label}</div>
          <div className="mt-1 truncate text-xs text-muted-foreground">{description}</div>
        </div>
        {actionLabel ? (
          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {actionLabel}
          </span>
        ) : null}
      </div>
      {badges.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {badges.map((badge) => (
            <Badge key={badge} variant="outline" className="text-[10px]">
              {badge}
            </Badge>
          ))}
        </div>
      ) : null}
    </button>
  );
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-muted/10 p-4">
      <div className="mb-4">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="mt-1 text-xs leading-5 text-muted-foreground">{description}</div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <div className="text-sm font-medium text-foreground">{label}</div>
      {description ? <div className="text-xs text-muted-foreground">{description}</div> : null}
      {children}
    </label>
  );
}

function RuntimeSection({
  runtime,
  providerId,
  envDraft,
  envDirty,
  onEnvDraftChange,
  toolsDraft,
  toolsDirty,
  onToolsDraftChange,
  busyAction,
  onSaveEnv,
  onSaveTools,
}: {
  runtime: DesktopOpenclawRuntimeState | null;
  providerId: string | null;
  envDraft: string;
  envDirty: boolean;
  onEnvDraftChange: (value: string) => void;
  toolsDraft: string;
  toolsDirty: boolean;
  onToolsDraftChange: (value: string) => void;
  busyAction:
    BusyAction;
  onSaveEnv: () => void;
  onSaveTools: () => void;
}) {
  if (!runtime) {
    return <LoadingBlock label="Loading OpenClaw runtime..." />;
  }

  const isLive = providerId ? runtime.live_provider_ids.includes(providerId) : false;
  const isDefault = providerId
    ? runtime.default_model.primary?.startsWith(`${providerId}/`) ?? false
    : false;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <RuntimeStat label="Config Path" value={runtime.config_path} />
        <RuntimeStat label="Live Status" value={isLive ? "Synced" : "Not synced"} />
        <RuntimeStat
          label="Default Model"
          value={isDefault ? runtime.default_model.primary ?? "Unset" : "Not default"}
        />
        <RuntimeStat
          label="Model Catalog Entries"
          value={String(runtime.model_catalog_count)}
        />
        <RuntimeStat
          label="Env Keys"
          value={runtime.env_keys.length > 0 ? runtime.env_keys.join(", ") : "None"}
        />
        <RuntimeStat
          label="Tool Keys"
          value={runtime.tool_keys.length > 0 ? runtime.tool_keys.join(", ") : "None"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-border bg-background p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-foreground">Environment</div>
              <div className="mt-1 text-xs text-muted-foreground">
                One `KEY=value` entry per line. Empty lines are ignored.
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={onSaveEnv}
              disabled={busyAction !== null || !envDirty}
            >
              {busyAction === "save-env" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Save env
            </Button>
          </div>
          <textarea
            className={cn(textareaClassName, "mt-4 min-h-[220px] font-mono text-xs")}
            value={envDraft}
            onChange={(event) => onEnvDraftChange(event.target.value)}
            spellCheck={false}
          />
        </div>

        <div className="rounded-xl border border-border bg-background p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-foreground">Tools JSON</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Edit the raw `tools` object from `openclaw.json`.
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={onSaveTools}
              disabled={busyAction !== null || !toolsDirty}
            >
              {busyAction === "save-tools" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Save tools
            </Button>
          </div>
          <textarea
            className={cn(textareaClassName, "mt-4 min-h-[220px] font-mono text-xs")}
            value={toolsDraft}
            onChange={(event) => onToolsDraftChange(event.target.value)}
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
}

function ConnectionTestCard({
  result,
}: {
  result: DesktopProviderConnectionTestResult;
}) {
  const toneClassName =
    result.status === "success"
      ? "border-emerald-500/30 bg-emerald-500/10"
      : result.status === "auth_error"
        ? "border-amber-500/30 bg-amber-500/10"
        : result.status === "warning"
          ? "border-orange-500/30 bg-orange-500/10"
          : "border-destructive/30 bg-destructive/10";
  const statusLabel =
    result.status === "success"
      ? "Reachable"
      : result.status === "auth_error"
        ? "Auth Failed"
        : result.status === "warning"
          ? "Needs Review"
          : "Probe Failed";

  return (
    <div className={cn("mt-4 rounded-xl border px-4 py-3", toneClassName)}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{statusLabel}</Badge>
        {result.http_status ? (
          <Badge variant="outline">HTTP {result.http_status}</Badge>
        ) : null}
        {result.used_stored_api_key ? (
          <Badge variant="outline">Used stored API key</Badge>
        ) : null}
      </div>
      <div className="mt-2 text-sm text-foreground">{result.message}</div>
      <div className="mt-2 text-xs text-muted-foreground">Checked: {result.checked_url}</div>
      {result.response_excerpt ? (
        <div className="mt-3 rounded-lg border border-border/60 bg-background/80 px-3 py-2 font-mono text-[11px] leading-5 text-muted-foreground">
          {result.response_excerpt}
        </div>
      ) : null}
    </div>
  );
}

function RuntimeStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background px-3 py-3">
      <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="mt-2 break-all text-sm text-foreground">{value}</div>
    </div>
  );
}

function DiagnosticsSection({
  runtime,
  provider,
}: {
  runtime: DesktopOpenclawRuntimeState | null;
  provider: DesktopManagedProvider | null;
}) {
  if (!runtime) {
    return <LoadingBlock label="Loading diagnostics..." />;
  }

  const providerWarnings = [...runtime.health_warnings];
  if (provider) {
    if (!runtime.live_provider_ids.includes(provider.id)) {
      providerWarnings.push("This provider has not been synced into OpenClaw yet.");
    }
    if (!provider.has_api_key) {
      providerWarnings.push("This provider does not have an API key stored yet.");
    }
  }

  if (providerWarnings.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-foreground">
        OpenClaw config looks healthy and no provider-specific issues were detected.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {providerWarnings.map((warning) => (
        <div
          key={warning}
          className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-foreground"
        >
          {warning}
        </div>
      ))}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-border bg-muted/10">
      <div className="max-w-md text-center">
        <div className="text-lg font-semibold text-foreground">{title}</div>
        <div className="mt-2 text-sm leading-6 text-muted-foreground">{body}</div>
      </div>
    </div>
  );
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/10 px-3 py-3 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

function AddProviderModal({
  presets,
  onClose,
  onSelectPreset,
  onSelectCustom,
}: {
  presets: DesktopProviderPreset[];
  onClose: () => void;
  onSelectPreset: (preset: DesktopProviderPreset) => void;
  onSelectCustom: () => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () =>
      presets.filter((preset) =>
        [preset.name, preset.base_url, preset.description ?? "", ...preset.models.map((model) => model.display_name)]
          .join(" ")
          .toLowerCase()
          .includes(query.trim().toLowerCase())
      ),
    [presets, query]
  );

  return (
    <ModalShell title="Add Provider" onClose={onClose}>
      <div className="space-y-4">
        <Input
          placeholder="Search preset catalog..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="max-h-[60vh] space-y-2 overflow-auto">
          {filtered.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-left transition hover:border-foreground/20 hover:bg-muted/20"
              onClick={() => onSelectPreset(preset)}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-foreground">{preset.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {preset.base_url}
                  </div>
                </div>
                <Badge variant="outline">{formatCategory(preset.category)}</Badge>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                {preset.description ?? "No description"}
              </div>
            </button>
          ))}
        </div>
        <div className="rounded-xl border border-dashed border-border p-4">
          <div className="text-sm font-medium text-foreground">Need a blank slate?</div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">
            Start from a custom OpenAI-compatible draft and fill the details manually.
          </div>
          <Button className="mt-3" variant="outline" onClick={onSelectCustom}>
            <Plus className="size-4" />
            New custom draft
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}

function ImportLiveProvidersModal({
  busy,
  runtime,
  onClose,
  onImport,
}: {
  busy: boolean;
  runtime: DesktopOpenclawRuntimeState | null;
  onClose: () => void;
  onImport: (providerIds: string[]) => Promise<void>;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    setSelectedIds(runtime?.live_providers.map((provider) => provider.id) ?? []);
  }, [runtime]);

  return (
    <ModalShell title="Import from OpenClaw Live Config" onClose={onClose}>
      {runtime && runtime.live_providers.length > 0 ? (
        <div className="space-y-4">
          <div className="text-sm leading-6 text-muted-foreground">
            Choose which live providers should be copied into Warwolf&apos;s managed provider hub.
          </div>
          <div className="max-h-[50vh] space-y-2 overflow-auto">
            {runtime.live_providers.map((provider) => {
              const selected = selectedIds.includes(provider.id);
              return (
                <label
                  key={provider.id}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-border px-4 py-3"
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={(event) => {
                      setSelectedIds((current) =>
                        event.target.checked
                          ? [...current, provider.id]
                          : current.filter((item) => item !== provider.id)
                      );
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground">{provider.id}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {provider.base_url}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge variant="outline">{provider.protocol}</Badge>
                      <Badge variant="outline">{provider.model_count} models</Badge>
                      {provider.has_api_key ? (
                        <Badge variant="outline">Credentialed</Badge>
                      ) : (
                        <Badge variant="secondary">No key</Badge>
                      )}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => void onImport(selectedIds)}
              disabled={busy || selectedIds.length === 0}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              Import {selectedIds.length > 0 ? selectedIds.length : ""} provider
              {selectedIds.length === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      ) : (
        <EmptyState
          title="No live providers detected"
          body="OpenClaw does not currently expose any live providers in openclaw.json."
        />
      )}
    </ModalShell>
  );
}

function ModalShell({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
      <div className="w-full max-w-3xl rounded-2xl border border-border bg-background p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="text-lg font-semibold text-foreground">{title}</div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

function toEditableProvider(provider: DesktopManagedProvider): EditableProvider {
  return {
    id: provider.id,
    is_new: false,
    name: provider.name,
    category: provider.category,
    provider_type: provider.provider_type,
    billing_category: provider.billing_category,
    protocol: provider.protocol,
    base_url: provider.base_url,
    api_key: "",
    enabled: provider.enabled,
    official_verified: provider.official_verified,
    preset_id: provider.preset_id,
    website_url: provider.website_url ?? "",
    description: provider.description ?? "",
    models: provider.models.map(toEditableModel),
  };
}

function toEditablePreset(preset: DesktopProviderPreset): EditableProvider {
  return {
    is_new: true,
    name: preset.name,
    category: preset.category,
    provider_type: preset.provider_type,
    billing_category: preset.billing_category,
    protocol: preset.protocol,
    base_url: preset.base_url,
    api_key: "",
    enabled: true,
    official_verified: preset.official_verified,
    preset_id: preset.id,
    website_url: preset.website_url ?? "",
    description: preset.description ?? "",
    models: preset.models.map(toEditableModel),
  };
}

function createEmptyCustomDraft(): EditableProvider {
  return {
    is_new: true,
    name: "Custom Provider",
    category: "custom",
    provider_type: "custom_gateway",
    billing_category: "custom",
    protocol: "openai-completions",
    base_url: "https://api.example.com/v1",
    api_key: "",
    enabled: true,
    official_verified: false,
    preset_id: "custom-openai",
    website_url: "",
    description: "Custom OpenAI-compatible endpoint.",
    models: [emptyEditableModel()],
  };
}

function emptyEditableModel(): EditableProviderModel {
  return {
    model_id: "",
    display_name: "",
    context_window: "",
    max_output_tokens: "",
    billing_kind: "",
    capability_tags: "",
  };
}

function toEditableModel(model: DesktopProviderModel): EditableProviderModel {
  return {
    model_id: model.model_id,
    display_name: model.display_name,
    context_window: model.context_window ? String(model.context_window) : "",
    max_output_tokens: model.max_output_tokens ? String(model.max_output_tokens) : "",
    billing_kind: model.billing_kind ?? "",
    capability_tags: model.capability_tags.join(", "),
  };
}

function toProviderPayload(draft: EditableProvider) {
  return {
    id: draft.is_new ? null : draft.id ?? null,
    name: draft.name,
    category: draft.category,
    provider_type: draft.provider_type,
    billing_category: draft.billing_category,
    protocol: draft.protocol,
    base_url: draft.base_url,
    api_key: draft.api_key.trim()
      ? draft.api_key.trim()
      : draft.is_new
        ? null
        : undefined,
    enabled: draft.enabled,
    official_verified: draft.official_verified,
    preset_id: draft.preset_id ?? null,
    website_url: draft.website_url.trim() || null,
    description: draft.description.trim() || null,
    models: draft.models.map((model) => ({
      model_id: model.model_id.trim(),
      display_name: model.display_name.trim(),
      context_window: parseOptionalNumber(model.context_window),
      max_output_tokens: parseOptionalNumber(model.max_output_tokens),
      billing_kind: model.billing_kind.trim() || null,
      capability_tags: model.capability_tags
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    })),
  };
}

function parseOptionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function serializeDraft(draft: EditableProvider) {
  return JSON.stringify({
    ...draft,
    api_key: draft.api_key,
    models: draft.models.map((model) => ({
      ...model,
      capability_tags: model.capability_tags
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .join(","),
    })),
  });
}

function matchesProviderSearch(
  provider: DesktopManagedProvider,
  search: string,
  categoryFilter: string
) {
  if (categoryFilter !== "all" && provider.category !== categoryFilter) return false;
  const query = search.trim().toLowerCase();
  if (!query) return true;
  const haystack = [
    provider.name,
    provider.base_url,
    provider.description ?? "",
    provider.category,
    provider.provider_type,
    ...provider.models.flatMap((model) => [model.model_id, model.display_name]),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function matchesPresetSearch(
  preset: DesktopProviderPreset,
  search: string,
  categoryFilter: string
) {
  if (categoryFilter !== "all" && preset.category !== categoryFilter) return false;
  const query = search.trim().toLowerCase();
  if (!query) return true;
  const haystack = [
    preset.name,
    preset.base_url,
    preset.description ?? "",
    preset.category,
    preset.provider_type,
    ...preset.models.flatMap((model) => [model.model_id, model.display_name]),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function providerBadges(
  provider: DesktopManagedProvider,
  runtime: DesktopOpenclawRuntimeState | null
) {
  const badges = [formatCategory(provider.category)];
  if (provider.enabled) badges.push("ON");
  if (runtime?.live_provider_ids.includes(provider.id)) badges.push("LIVE");
  if (runtime?.default_model.primary?.startsWith(`${provider.id}/`)) badges.push("DEFAULT");
  return badges;
}

function formatCategory(category: string) {
  return category
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function setDraftValue<K extends keyof EditableProvider>(
  setDraft: Dispatch<SetStateAction<EditableProvider | null>>,
  key: K,
  value: EditableProvider[K]
) {
  setDraft((current) => (current ? { ...current, [key]: value } : current));
}

function updateDraftModel<K extends keyof EditableProviderModel>(
  setDraft: Dispatch<SetStateAction<EditableProvider | null>>,
  index: number,
  key: K,
  value: EditableProviderModel[K]
) {
  setDraft((current) => {
    if (!current) return current;
    return {
      ...current,
      models: current.models.map((model, modelIndex) =>
        modelIndex === index ? { ...model, [key]: value } : model
      ),
    };
  });
}

function errorMessage(value: unknown) {
  return value instanceof Error ? value.message : undefined;
}

function serializeEnvMap(env: Record<string, string>) {
  return Object.entries(env)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function parseEnvDraft(text: string) {
  const env: Record<string, string> = {};
  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      throw new Error(`Invalid env entry: "${rawLine}". Expected KEY=value.`);
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1);
    if (!key) {
      throw new Error(`Invalid env entry: "${rawLine}". Missing key.`);
    }
    env[key] = value;
  }
  return env;
}

function serializeToolsObject(tools: Record<string, unknown>) {
  return JSON.stringify(tools, null, 2);
}

function parseToolsDraft(text: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON.";
    throw new Error(`Invalid tools JSON: ${message}`);
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("Invalid tools JSON: root value must be an object.");
  }
  return parsed as Record<string, unknown>;
}

function normalizeJsonText(text: string) {
  try {
    return JSON.stringify(JSON.parse(text));
  } catch {
    return text.trim();
  }
}

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const textareaClassName =
  "flex min-h-[96px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
