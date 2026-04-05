import React, { useEffect, useState } from "react";
import {
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

type AnyFn = (...args: any[]) => any;

type Props = {
  activeOptionsItem: any;
  isProcessingArchive: boolean;

  isRenameModalOpen: boolean;
  renameText: string;

  isMoveModalOpen: boolean;
  allFolders: any[];
  selectedIds: Set<string>;

  isCopyModalOpen: boolean;
  vaultItems: any[];

  isOcrModalOpen: boolean;
  ocrFilename: string;
  ocrText: string;

  isFolderModalOpen: boolean;
  newFolderName: string;

  isShareModalOpen: boolean;
  shareUsername: string;

  setActiveOptionsItem: (v: any) => void;
  setIsRenameModalOpen: (v: boolean) => void;
  setRenameText: (v: string) => void;
  setIsMoveModalOpen: (v: boolean) => void;
  setIsCopyModalOpen: (v: boolean) => void;
  setIsOcrModalOpen: (v: boolean) => void;
  setOcrFilename: (v: string) => void;
  setOcrText: (v: string) => void;
  setIsFolderModalOpen: (v: boolean) => void;
  setNewFolderName: (v: string) => void;
  setIsShareModalOpen: (v: boolean) => void;
  setShareUsername: (v: string) => void;

  handleExtractText: AnyFn;
  submitRename: AnyFn;
  submitCopy: AnyFn;
  submitMove: AnyFn;
  handleCompress: AnyFn;
  handleExtract: AnyFn;
  handleExtractPdfImages: AnyFn;
  handleDownload: AnyFn;
  handleDelete: AnyFn;
  saveOcrDocument: AnyFn;
  createFolder: AnyFn;
  handleShare: AnyFn;
};

const Sheet = ({ children, style }: any) => (
  <View style={[styles.dialog, style]}>{children}</View>
);

const RowButtons = ({
  onCancel,
  onConfirm,
  cancelText = "Cancel",
  confirmText = "Save",
  danger = false,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  cancelText?: string;
  confirmText?: string;
  danger?: boolean;
}) => (
  <View style={styles.rowButtons}>
    <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={onCancel}>
      <Text style={styles.btnGhostText}>{cancelText}</Text>
    </TouchableOpacity>
    <TouchableOpacity
      style={[styles.btn, danger ? styles.btnDanger : styles.btnPrimary]}
      onPress={onConfirm}
    >
      <Text style={styles.btnPrimaryText}>{confirmText}</Text>
    </TouchableOpacity>
  </View>
);

function VaultModals(props: Props) {
  const {
    activeOptionsItem,
    isProcessingArchive,
    isRenameModalOpen,
    renameText,
    isMoveModalOpen,
    allFolders,
    selectedIds,
    isCopyModalOpen,
    vaultItems,
    isOcrModalOpen,
    ocrFilename,
    ocrText,
    isFolderModalOpen,
    newFolderName,
    isShareModalOpen,
    shareUsername,
    setActiveOptionsItem,
    setIsRenameModalOpen,
    setRenameText,
    setIsMoveModalOpen,
    setIsCopyModalOpen,
    setIsOcrModalOpen,
    setOcrFilename,
    setOcrText,
    setIsFolderModalOpen,
    setNewFolderName,
    setIsShareModalOpen,
    setShareUsername,
    handleExtractText,
    submitRename,
    submitCopy,
    submitMove,
    handleCompress,
    handleExtract,
    handleExtractPdfImages,
    handleDownload,
    handleDelete,
    saveOcrDocument,
    createFolder,
    handleShare,
    openMoveOrCopyModal,
  } = props;

  // Local typing state (decoupled from parent while modal is open)
  const [renameLocal, setRenameLocal] = useState("");
  const [folderLocal, setFolderLocal] = useState("");
  const [shareLocal, setShareLocal] = useState("");
  const [ocrNameLocal, setOcrNameLocal] = useState("");
  const [ocrTextLocal, setOcrTextLocal] = useState("");

  useEffect(() => {
    if (isRenameModalOpen) setRenameLocal(renameText || "");
  }, [isRenameModalOpen, renameText]);

  useEffect(() => {
    if (isFolderModalOpen) setFolderLocal(newFolderName || "");
  }, [isFolderModalOpen, newFolderName]);

  useEffect(() => {
    if (isShareModalOpen) setShareLocal(shareUsername || "");
  }, [isShareModalOpen, shareUsername]);

  useEffect(() => {
    if (isOcrModalOpen) {
      setOcrNameLocal(ocrFilename || "");
      setOcrTextLocal(ocrText || "");
    }
  }, [isOcrModalOpen, ocrFilename, ocrText]);

  const isImage =
    activeOptionsItem?.type === "file" &&
    activeOptionsItem?.fileType?.startsWith?.("image/");
  const isPdf =
    activeOptionsItem?.type === "file" &&
    activeOptionsItem?.filename?.toLowerCase?.().endsWith(".pdf");
  const isArchive =
    activeOptionsItem?.type === "file" &&
    /\.(zip|rar|7z|tar|gz)$/i.test(activeOptionsItem?.filename || "");

  const activeId = activeOptionsItem?.itemId || activeOptionsItem?.id;
  const getFolderId = (f: any) => f?.itemId || f?.id;
  const getFolderName = (f: any) => f?.folderName || f?.name || "Untitled";

  const moveTargets = (allFolders || []).filter(
    (f) => getFolderId(f) !== activeId,
  );
  const copyTargets = (vaultItems || []).filter(
    (v) =>
      (v.type === "folder" || v.itemType === "folder") &&
      getFolderId(v) !== activeId,
  );

  return (
    <>
      {/* OPTIONS MENU */}
      <Modal visible={!!activeOptionsItem} transparent animationType="fade">
        <TouchableOpacity
          activeOpacity={1}
          style={styles.overlay}
          onPress={() => !isProcessingArchive && setActiveOptionsItem(null)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.menuSheet}>
            <Text style={styles.menuTitle} numberOfLines={1}>
              {activeOptionsItem?.name ||
                activeOptionsItem?.filename ||
                "Options"}
            </Text>

            {isImage && (
              <TouchableOpacity
                style={styles.menuItem}
                disabled={isProcessingArchive}
                onPress={handleExtractText}
              >
                <Text style={styles.menuItemText}>🧠 Extract Text (OCR)</Text>
              </TouchableOpacity>
            )}

            {isPdf && (
              <TouchableOpacity
                style={styles.menuItem}
                disabled={isProcessingArchive}
                onPress={handleExtractPdfImages}
              >
                <Text style={styles.menuItemText}>
                  🖼️ Extract PDF Pages as Images
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.menuItem}
              disabled={isProcessingArchive}
              onPress={() => {
                setRenameText(
                  activeOptionsItem?.name || activeOptionsItem?.filename || "",
                );
                setIsRenameModalOpen(true);
              }}
            >
              <Text style={styles.menuItemText}>✏️ Rename</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              disabled={isProcessingArchive}
              onPress={() => openMoveOrCopyModal("move", activeOptionsItem)}
            >
              <Text style={styles.menuItemText}>🚚 Move</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              disabled={isProcessingArchive}
              onPress={() => openMoveOrCopyModal("copy", activeOptionsItem)}
            >
              <Text style={styles.menuItemText}>📄 Copy</Text>
            </TouchableOpacity>

            {isArchive ? (
              <TouchableOpacity
                style={styles.menuItem}
                disabled={isProcessingArchive}
                onPress={handleExtract}
              >
                <Text style={styles.menuItemText}>📦 Extract Archive</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.menuItem}
                disabled={isProcessingArchive}
                onPress={handleCompress}
              >
                <Text style={styles.menuItemText}>🗜️ Compress</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.menuItem}
              disabled={isProcessingArchive}
              onPress={() => handleDownload(activeOptionsItem)}
            >
              <Text style={styles.menuItemText}>⬇️ Download</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              disabled={isProcessingArchive}
              onPress={() => setIsShareModalOpen(true)}
            >
              <Text style={styles.menuItemText}>🔗 Share</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              disabled={isProcessingArchive}
              onPress={handleDelete}
            >
              <Text style={[styles.menuItemText, { color: "#ef4444" }]}>
                🗑️ Delete
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, { justifyContent: "center" }]}
              onPress={() => setActiveOptionsItem(null)}
            >
              <Text style={[styles.menuItemText, { color: "#9ca3af" }]}>
                Close
              </Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* RENAME */}
      <Modal visible={isRenameModalOpen} transparent animationType="fade">
        <View style={styles.overlay}>
          <Sheet>
            <Text style={styles.title}>Rename</Text>
            <TextInput
              style={styles.input}
              value={renameLocal}
              onChangeText={setRenameLocal}
              autoCorrect={false}
              autoCapitalize="none"
            />
            <RowButtons
              onCancel={() => setIsRenameModalOpen(false)}
              onConfirm={() => submitRename(renameLocal)}
              confirmText="Rename"
            />
          </Sheet>
        </View>
      </Modal>

      {/* MOVE */}
      <Modal visible={isMoveModalOpen} transparent animationType="fade">
        <View style={styles.overlay}>
          <Sheet style={{ maxHeight: "78%" }}>
            <Text style={styles.title}>
              {selectedIds?.size > 0
                ? `Move ${selectedIds.size} items`
                : "Move to folder"}
            </Text>
            <View style={{ marginTop: 8 }}>
              {moveTargets.length === 0 ? (
                <Text style={styles.emptyText}>
                  No destination folders found.
                </Text>
              ) : (
                moveTargets.map((f) => (
                  <TouchableOpacity
                    key={getFolderId(f)}
                    style={styles.listRow}
                    onPress={() => submitMove(f, activeOptionsItem)}
                  >
                    <Text style={styles.listRowText}>
                      📁 {getFolderName(f)}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
            <RowButtons
              onCancel={() => setIsMoveModalOpen(false)}
              onConfirm={() => setIsMoveModalOpen(false)}
              confirmText="Done"
            />
          </Sheet>
        </View>
      </Modal>

      {/* COPY */}
      <Modal visible={isCopyModalOpen} transparent animationType="fade">
        <View style={styles.overlay}>
          <Sheet style={{ maxHeight: "78%" }}>
            <Text style={styles.title}>Copy to folder</Text>
            <View style={{ marginTop: 8 }}>
              {copyTargets.length === 0 ? (
                <Text style={styles.emptyText}>
                  No destination folders found.
                </Text>
              ) : (
                copyTargets.map((f) => (
                  <TouchableOpacity
                    key={getFolderId(f)}
                    style={styles.listRow}
                    onPress={() => submitCopy(f, activeOptionsItem)}
                  >
                    <Text style={styles.listRowText}>
                      📁 {getFolderName(f)}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
            <RowButtons
              onCancel={() => setIsCopyModalOpen(false)}
              onConfirm={() => setIsCopyModalOpen(false)}
              confirmText="Done"
            />
          </Sheet>
        </View>
      </Modal>

      {/* OCR SAVE */}
      <Modal visible={isOcrModalOpen} transparent animationType="fade">
        <View style={styles.overlay}>
          <Sheet style={styles.ocrWrap}>
            <Text style={styles.title}>Save Extracted Text</Text>

            <TextInput
              style={styles.input}
              value={ocrNameLocal}
              onChangeText={setOcrNameLocal}
              autoCorrect={false}
              autoCapitalize="none"
              blurOnSubmit={false}
            />

            <TextInput
              style={[styles.input, styles.ocrTextInput]}
              multiline
              value={ocrTextLocal}
              onChangeText={setOcrTextLocal}
              autoCorrect={false}
              autoCapitalize="none"
              blurOnSubmit={false}
            />

            <RowButtons
              onCancel={() => setIsOcrModalOpen(false)}
              onConfirm={() => saveOcrDocument(ocrNameLocal, ocrTextLocal)}
              cancelText="Discard"
              confirmText="Save as .txt"
            />
          </Sheet>
        </View>
      </Modal>

      {/* NEW FOLDER */}
      <Modal visible={isFolderModalOpen} transparent animationType="fade">
        <View style={styles.overlay}>
          <Sheet>
            <Text style={styles.title}>Create Folder</Text>
            <TextInput
              style={styles.input}
              value={folderLocal}
              onChangeText={setFolderLocal}
              autoCorrect={false}
            />
            <RowButtons
              onCancel={() => setIsFolderModalOpen(false)}
              onConfirm={() => {
                setNewFolderName(folderLocal);
                createFolder();
              }}
              confirmText="Create"
            />
          </Sheet>
        </View>
      </Modal>

      {/* SHARE */}
      <Modal visible={isShareModalOpen} transparent animationType="fade">
        <View style={styles.overlay}>
          <Sheet>
            <Text style={styles.title}>Share</Text>

            <TouchableOpacity
              style={[styles.shareBtn, { marginBottom: 10 }]}
              onPress={() => handleShare(true)}
            >
              <Text style={styles.shareBtnText}>🌍 Create Public Link</Text>
            </TouchableOpacity>

            <Text style={styles.orText}>or share privately</Text>

            <TextInput
              style={styles.input}
              value={shareLocal}
              onChangeText={setShareLocal}
              placeholder="Enter username"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <RowButtons
              onCancel={() => setIsShareModalOpen(false)}
              onConfirm={() => {
                setShareUsername(shareLocal);
                handleShare(false);
              }}
              confirmText="Share"
            />
          </Sheet>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  dialog: {
    width: "92%",
    maxWidth: 560,
    borderRadius: 16,
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#374151",
    padding: 14,
  },
  ocrWrap: {
    width: "92%",
    maxWidth: 700,
    height: Platform.OS === "web" ? 560 : "82%",
  },
  title: {
    color: "#f9fafb",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 10,
  },
  input: {
    backgroundColor: "#1f2937",
    color: "#f9fafb",
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  ocrTextInput: {
    flex: 1,
    textAlignVertical: "top",
    minHeight: 220,
  },
  rowButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 4,
  },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  btnGhost: {
    backgroundColor: "#1f2937",
    borderWidth: 1,
    borderColor: "#374151",
  },
  btnPrimary: {
    backgroundColor: "#2563eb",
  },
  btnDanger: {
    backgroundColor: "#dc2626",
  },
  btnGhostText: {
    color: "#e5e7eb",
    fontWeight: "600",
  },
  btnPrimaryText: {
    color: "#fff",
    fontWeight: "700",
  },
  menuSheet: {
    width: "92%",
    maxWidth: 380,
    borderRadius: 16,
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#374151",
    overflow: "hidden",
  },
  menuTitle: {
    color: "#f9fafb",
    fontWeight: "700",
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1f2937",
  },
  menuItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1f2937",
  },
  menuItemText: {
    color: "#e5e7eb",
    fontSize: 15,
    fontWeight: "500",
  },
  listRow: {
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#1f2937",
  },
  listRowText: {
    color: "#e5e7eb",
    fontSize: 15,
  },
  emptyText: {
    color: "#9ca3af",
    fontSize: 14,
    paddingVertical: 8,
  },
  shareBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
  },
  shareBtnText: {
    color: "#fff",
    fontWeight: "700",
  },
  orText: {
    color: "#9ca3af",
    fontSize: 12,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
});

export default VaultModals;
