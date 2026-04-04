import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Select, message } from "antd";
import { Download, FolderOpen, Loader2, Terminal, X } from "lucide-react";
import {
  buildCodeToolsProviderCatalog,
  CLI_TOOLS,
  CLAUDE_CODE,
  filterProvidersForTool,
  GEMINI_CLI,
  GITHUB_COPILOT_CLI,
  getCodeToolModelUniqId,
  OPENAI_CODEX,
  parseEnvironmentVariables,
  type CodeToolId,
} from "@/features/code-tools";
import { AnthropicProviderListPopover } from "@/features/code-tools/components/AnthropicProviderListPopover";
import {
  findSelectedModel,
  ModelSelector,
} from "@/features/code-tools/components/ModelSelector";
import { useCodeTools } from "@/hooks/useCodeTools";
import { Button } from "@/components/ui/button";
import {
  getCodeToolAvailableTerminals,
  getCodexRuntime,
  getManagedProviders,
  getProviderPresets,
  installBunBinary,
  isBinaryExist,
  runCodeTool,
  type CodeToolsTerminalConfig,
} from "@/lib/tauri";

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  if (error && typeof error === "object" && "message" in error) {
    const msg =
      typeof error.message === "string" ? error.message : JSON.stringify(error.message);
    if (msg && msg !== "null" && msg !== "undefined") {
      return msg;
    }
  }

  return fallback;
}

export function CodeToolsPage() {
  const {
    selectedCliTool,
    selectedModel,
    selectedTerminal,
    environmentVariables,
    directories,
    currentDirectory,
    canLaunch,
    setCliTool,
    setModel,
    setTerminal,
    setEnvVars,
    setCurrentDir,
    removeDir,
    selectFolder,
  } = useCodeTools();
  const [api, contextHolder] = message.useMessage();
  const [isBunInstalled, setIsBunInstalled] = useState(false);
  const [isInstallingBun, setIsInstallingBun] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [autoUpdateToLatest, setAutoUpdateToLatest] = useState(false);
  const [availableTerminals, setAvailableTerminals] = useState<
    CodeToolsTerminalConfig[]
  >([]);
  const [isLoadingTerminals, setIsLoadingTerminals] = useState(false);

  const presetsQuery = useQuery({
    queryKey: ["code-tools-provider-presets"],
    queryFn: async () => (await getProviderPresets()).presets,
  });
  const managedProvidersQuery = useQuery({
    queryKey: ["code-tools-managed-providers"],
    queryFn: async () => (await getManagedProviders()).providers,
  });
  const codexRuntimeQuery = useQuery({
    queryKey: ["code-tools-codex-runtime"],
    queryFn: async () => (await getCodexRuntime()).runtime,
  });

  const providerCatalog = useMemo(
    () =>
      buildCodeToolsProviderCatalog(
        managedProvidersQuery.data ?? [],
        presetsQuery.data ?? []
      ),
    [managedProvidersQuery.data, presetsQuery.data]
  );
  const availableProviders = useMemo(
    () => filterProvidersForTool(providerCatalog, selectedCliTool),
    [providerCatalog, selectedCliTool]
  );
  const anthropicProviderNames = useMemo(
    () =>
      filterProvidersForTool(providerCatalog, CLAUDE_CODE).map(
        (provider) => provider.name
      ),
    [providerCatalog]
  );

  const selectedModelValue = selectedModel
    ? getCodeToolModelUniqId(selectedModel)
    : undefined;
  const codexAuthReady =
    codexRuntimeQuery.data?.has_chatgpt_tokens ||
    codexRuntimeQuery.data?.has_api_key ||
    false;

  const checkBunInstallation = useCallback(async () => {
    try {
      const installed = await isBinaryExist("bun");
      setIsBunInstalled(installed);
    } catch {
      setIsBunInstalled(false);
    }
  }, []);

  const loadAvailableTerminals = useCallback(async () => {
    try {
      setIsLoadingTerminals(true);
      const terminals = await getCodeToolAvailableTerminals();
      setAvailableTerminals(terminals);
      if (
        terminals.length > 0 &&
        !terminals.some((terminal) => terminal.id === selectedTerminal)
      ) {
        setTerminal(terminals[0].id);
      }
    } catch {
      setAvailableTerminals([]);
    } finally {
      setIsLoadingTerminals(false);
    }
  }, [selectedTerminal, setTerminal]);

  useEffect(() => {
    void checkBunInstallation();
    void loadAvailableTerminals();
  }, [checkBunInstallation, loadAvailableTerminals]);

  const handleModelChange = (value: string | undefined) => {
    setModel(findSelectedModel(availableProviders, value));
  };

  const handleInstallBun = async () => {
    setIsInstallingBun(true);
    try {
      await installBunBinary();
      api.success("Bun 安装完成");
      await checkBunInstallation();
    } catch (error) {
      api.error(getErrorMessage(error, "安装 Bun 失败"));
    } finally {
      setIsInstallingBun(false);
    }
  };

  const handleSelectFolder = async () => {
    try {
      await selectFolder();
    } catch (error) {
      api.error(getErrorMessage(error, "打开文件夹选择器失败，请重试"));
    }
  };

  const handleLaunch = async () => {
    if (!isBunInstalled) {
      api.warning("请先安装 Bun 环境再启动 CLI 工具");
      return;
    }
    if (!currentDirectory) {
      api.warning("请选择工作目录");
      return;
    }
    if (!selectedModel && selectedCliTool !== GITHUB_COPILOT_CLI) {
      api.warning("请选择模型");
      return;
    }

    setIsLaunching(true);
    try {
      const result = await runCodeTool({
        cliTool: selectedCliTool,
        directory: currentDirectory,
        terminal: selectedTerminal,
        autoUpdateToLatest,
        environmentVariables: parseEnvironmentVariables(environmentVariables),
        selectedModel: selectedModel
          ? {
              providerId: selectedModel.providerId,
              providerName: selectedModel.providerName,
              providerType: selectedModel.providerType,
              runtimeTarget: selectedModel.runtimeTarget,
              baseUrl: selectedModel.baseUrl,
              protocol: selectedModel.protocol,
              modelId: selectedModel.modelId,
              displayName: selectedModel.displayName,
              managedProviderId: selectedModel.managedProviderId,
              presetId: selectedModel.presetId,
              hasStoredCredential: selectedModel.hasStoredCredential,
            }
          : null,
      });

      if (result.success) {
        api.success(result.message || "启动成功");
      } else {
        api.error(result.message || "启动失败，请重试");
      }
    } catch (error) {
      api.error(getErrorMessage(error, "启动失败，请重试"));
    } finally {
      setIsLaunching(false);
    }
  };

  const codexNoticeVisible = selectedCliTool === OPENAI_CODEX && !codexAuthReady;
  const shouldShowModelSelector = selectedCliTool !== GITHUB_COPILOT_CLI;
  const shouldShowTerminalSelector = availableTerminals.length > 0;

  return (
    <div className="flex flex-1 flex-col bg-background">
      {contextHolder}
      <div className="flex flex-1 overflow-y-auto py-7">
        <div className="mx-auto min-h-fit w-[600px]">
          <h1 className="mb-2 text-xl font-semibold text-foreground">
            代码工具
          </h1>
          <p className="mb-8 text-[13px] leading-relaxed text-muted-foreground">
            快速启动多个代码 CLI 工具，提高开发效率
          </p>

          {!isBunInstalled && (
            <div className="mb-6 flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-[13px]">
              <span className="text-amber-700 dark:text-amber-400">
                运行 CLI 工具需要安装 Bun 环境
              </span>
              <Button
                size="sm"
                onClick={() => void handleInstallBun()}
                disabled={isInstallingBun}
              >
                {isInstallingBun ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <Download className="mr-1.5 size-3.5" />
                )}
                {isInstallingBun ? "安装中..." : "安装 Bun"}
              </Button>
            </div>
          )}

          {codexNoticeVisible && (
            <div className="mb-6 rounded-lg border border-blue-500/30 bg-blue-500/5 px-4 py-3">
              <div className="text-[13px] font-medium text-blue-700 dark:text-blue-400">
                OpenAI Codex 当前未检测到可用的 Codex 登录态或 API 凭据
              </div>
              <div className="mt-1 text-[12px] text-blue-600/80 dark:text-blue-400/70">
                如果使用 OpenAI Codex，建议先在设置中的 Provider 页面完成 Codex
                登录。
              </div>
            </div>
          )}

          <div className="mb-8 space-y-6">
            {/* CLI Tool */}
            <div>
              <div className="mb-2 flex items-center gap-2 text-[13px] font-medium text-foreground">
                CLI 工具
              </div>
              <Select
                style={{ width: "100%" }}
                placeholder="选择要使用的 CLI 工具"
                value={selectedCliTool}
                options={CLI_TOOLS}
                onChange={(value) => setCliTool(value as CodeToolId)}
              />
            </div>

            {/* Model */}
            {shouldShowModelSelector && (
              <div>
                <div className="mb-2 flex items-center gap-2 text-[13px] font-medium text-foreground">
                  模型
                  {selectedCliTool === CLAUDE_CODE && (
                    <AnthropicProviderListPopover
                      providerNames={anthropicProviderNames}
                    />
                  )}
                </div>
                <ModelSelector
                  providers={availableProviders}
                  value={selectedModelValue}
                  placeholder="选择要使用的模型"
                  onChange={handleModelChange}
                />
                {availableProviders.length === 0 && (
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    当前没有可用于
                    {selectedCliTool === CLAUDE_CODE
                      ? " Claude Code"
                      : selectedCliTool === GEMINI_CLI
                        ? " Gemini CLI"
                        : " 该工具"}
                    的服务商配置，页面会先显示预设目录。
                  </p>
                )}
              </div>
            )}

            {/* Working directory */}
            <div>
              <div className="mb-2 flex items-center gap-2 text-[13px] font-medium text-foreground">
                工作目录
              </div>
              <div className="flex w-full items-center gap-2">
                <Select
                  style={{ flex: 1 }}
                  placeholder="选择工作目录"
                  value={currentDirectory || undefined}
                  onChange={setCurrentDir}
                  allowClear
                  showSearch
                  filterOption={(input, option) => {
                    const label =
                      typeof option?.label === "string"
                        ? option.label
                        : String(option?.value ?? "");
                    return label.toLowerCase().includes(input.toLowerCase());
                  }}
                  options={directories.map((directory) => ({
                    value: directory,
                    label: directory,
                  }))}
                  optionRender={(option) => (
                    <div className="flex items-center justify-between">
                      <span className="min-w-0 flex-1 truncate">
                        {String(option.value)}
                      </span>
                      <X
                        size={14}
                        className="ml-2 shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
                        onClick={(event) => {
                          event.stopPropagation();
                          removeDir(String(option.value));
                        }}
                      />
                    </div>
                  )}
                />
                <Button
                  variant="outline"
                  className="shrink-0"
                  onClick={() => void handleSelectFolder()}
                >
                  选择文件夹
                </Button>
              </div>
            </div>

            {/* Environment variables */}
            <div>
              <div className="mb-2 flex items-center gap-2 text-[13px] font-medium text-foreground">
                环境变量
              </div>
              <textarea
                rows={2}
                value={environmentVariables}
                placeholder={`KEY1=value1\nKEY2=value2`}
                onChange={(event) => setEnvVars(event.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-[13px] text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <p className="mt-1 text-[12px] text-muted-foreground">
                输入自定义环境变量（每行一个，格式：KEY=value）
              </p>
            </div>

            {/* Terminal */}
            {shouldShowTerminalSelector && (
              <div>
                <div className="mb-2 flex items-center gap-2 text-[13px] font-medium text-foreground">
                  终端
                </div>
                <div className="flex w-full items-center gap-2">
                  <Select
                    style={{ flex: 1 }}
                    placeholder="选择终端应用"
                    value={selectedTerminal}
                    loading={isLoadingTerminals}
                    onChange={setTerminal}
                    options={availableTerminals.map((terminal) => ({
                      value: terminal.id,
                      label: terminal.name,
                    }))}
                  />
                  <Button variant="outline" disabled className="shrink-0">
                    <FolderOpen className="mr-1.5 size-4" />
                    终端路径
                  </Button>
                </div>
              </div>
            )}

            {/* Update option */}
            <div>
              <div className="mb-2 flex items-center gap-2 text-[13px] font-medium text-foreground">
                更新选项
              </div>
              <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-foreground">
                <input
                  type="checkbox"
                  checked={autoUpdateToLatest}
                  onChange={(event) =>
                    setAutoUpdateToLatest(event.target.checked)
                  }
                  className="size-4 rounded border-border accent-primary"
                />
                检查更新并安装最新版本
              </label>
            </div>
          </div>

          <Button
            className="h-10 w-full"
            onClick={() => void handleLaunch()}
            disabled={!canLaunch || !isBunInstalled || isLaunching}
          >
            {isLaunching ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Terminal className="mr-2 size-4" />
            )}
            {isLaunching ? "启动中..." : "启动"}
          </Button>
        </div>
      </div>
    </div>
  );
}
