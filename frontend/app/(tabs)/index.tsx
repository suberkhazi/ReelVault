import { ResizeMode, Video } from "expo-av";
import { BlurView } from "expo-blur";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as Sharing from "expo-sharing";
import * as VideoThumbnails from "expo-video-thumbnails";
import React, { useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { io } from "socket.io-client";
import AuthScreen from "../../components/AuthScreen";
import FileViewer from "../../components/FileViewer";
import VaultModals from "../../components/VaultModals";
import { BASE_URL, vaultApi } from "../../services/vaultApi";
import { useAppTheme } from "../../theme/useAppTheme";
import AdminPanel from "../../components/AdminPanel";

// --- MINI COMPONENT: ASYNC VIDEO THUMBNAIL ---
const VideoThumbnail = ({ videoUrl }) => {
  const [image, setImage] = useState<string | null>(null);

  useEffect(() => {
    const generateThumbnail = async () => {
      try {
        const { uri } = await VideoThumbnails.getThumbnailAsync(videoUrl, {
          time: 1000,
        });
        setImage(uri);
      } catch (e) {
        console.warn("Could not generate thumbnail", e);
      }
    };
    generateThumbnail();
  }, [videoUrl]);

  if (image) {
    return (
      <Image
        source={{ uri: image }}
        style={{
          width: "100%",
          height: 110,
          borderRadius: 14,
          backgroundColor: "#111",
        }}
        resizeMode="cover"
      />
    );
  }

  return (
    <View
      style={{
        width: "100%",
        height: 110,
        backgroundColor: "#333",
        borderRadius: 14,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Text style={{ fontSize: 30 }}>🎬</Text>
    </View>
  );
};

const Glass = ({ children, style, isDark }) => {
  if (Platform.OS === "web") {
    return (
      <View style={[{ backdropFilter: "blur(18px)" } as any, style]}>
        {children}
      </View>
    );
  }
  return (
    <BlurView intensity={34} tint={isDark ? "dark" : "light"} style={style}>
      {children}
    </BlurView>
  );
};

export default function Home() {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const [activeTab, setActiveTab] = useState<"home" | "shared">("home");
  const [serverMessage, setServerMessage] = useState("Vault online.");
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderHistory, setFolderHistory] = useState<any[]>([]);
  const [vaultItems, setVaultItems] = useState<any[]>([]);
  const [activeViewerItem, setActiveViewerItem] = useState<any>(null);
  const [isOcrModalOpen, setIsOcrModalOpen] = useState(false);
  const [ocrText, setOcrText] = useState("");
  const [ocrFilename, setOcrFilename] = useState("");
  const [allFolders, setAllFolders] = useState<any[]>([]);
  const [isAdminOpen, setIsAdminOpen] = useState(false);

  // --- SELECTION ENGINE STATE ---
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // --- AUTHENTICATION STATE ---
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);

  // search
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);

  const normalizeId = (x: any) => String(x?.id ?? x?.itemId ?? "");

  // --- CONTEXT MENU STATE ---
  const [activeOptionsItem, setActiveOptionsItem] = useState<any>(null);
  const [isProcessingArchive, setIsProcessingArchive] = useState(false);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [renameText, setRenameText] = useState("");
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [isCopyModalOpen, setIsCopyModalOpen] = useState(false);

  // --- REELS ENGINE STATE ---
  const [viewMode, setViewMode] = useState<"grid" | "reel">("grid");
  const [activeReelIndex, setActiveReelIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  // --- SHARE MODAL STATE ---
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareUsername, setShareUsername] = useState("");

  // --- SHARED DASHBOARD STATE ---
  const [isViewingShared, setIsViewingShared] = useState(false);
  const [sharedItems, setSharedItems] = useState<any[]>([]);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 70 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems.length > 0) setActiveReelIndex(viewableItems[0].index);
  }).current;

  // --- RESPONSIVE LAYOUT ENGINE ---
  const { width, height } = useWindowDimensions();
  const isMobile = width < 768;
  const screenHeight = height - 120;

  const containerPadding = 30;
  const itemGap = 14;
  const numCols = isMobile
    ? 2
    : Math.max(2, Math.floor((width - containerPadding) / (160 + itemGap)));
  const itemWidth = isMobile ? (width - containerPadding - itemGap) / 2 : 160;

  // --- NEW UI STATES ---
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [activeUploads, setActiveUploads] = useState<any>({});
  const [isAiEnabled, setIsAiEnabled] = useState(false);

  // --- UNIFIED TOAST SYSTEM ---
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2800);
  };

  const loadVault = async (folderId: string | null = null) => {
    if (!currentUser) return;
    try {
      const data = await vaultApi.loadVault(folderId, currentUser.id);
      if (!folderId) setCurrentFolderId(data.currentFolderId);
      const combinedItems = [
        ...data.folders.map((f) => ({ ...f, type: "folder" })),
        ...data.files.map((f) => ({ ...f, type: "file" })),
      ];
      setVaultItems(combinedItems);
    } catch (error) {
      console.log("Error loading vault:", error);
    }
  };

  const loadSharedItems = async () => {
    if (!currentUser) return;
    showToast("⏳ Loading Shared files...");
    try {
      const data = await vaultApi.getSharedWithMe(currentUser.username);
      const formatted = data.map((item) => ({
        id: item.itemId,
        type: item.itemType,
        name: item.folderName || item.filename,
        filename: item.filename,
        fileType: item.fileType || "folder",
        sharedBy: item.sharedByUsername,
      }));
      setSharedItems(formatted);
      setIsViewingShared(true);
      showToast("✅ Shared vault loaded.");
    } catch (error) {
      showToast("❌ Failed to load shared items.");
    }
  };

  // Single authoritative vault loader effect
  useEffect(() => {
    if (!currentUser) return;
    if (
      isOcrModalOpen ||
      isRenameModalOpen ||
      isShareModalOpen ||
      isFolderModalOpen
    )
      return;
    loadVault(currentFolderId);
  }, [
    currentFolderId,
    currentUser,
    isOcrModalOpen,
    isRenameModalOpen,
    isShareModalOpen,
    isFolderModalOpen,
  ]);

  // --- NATIVE & WEB PERSISTENCE ---
  useEffect(() => {
    const loadSavedAuth = async () => {
      try {
        if (Platform.OS === "web") {
          const savedFolder = sessionStorage.getItem("rv_folder");
          const savedHistory = sessionStorage.getItem("rv_history");
          const savedUser = sessionStorage.getItem("rv_user");
          const savedToken = sessionStorage.getItem("rv_token");

          if (savedUser && savedToken) {
            setCurrentUser(JSON.parse(savedUser));
            setAuthToken(savedToken);
          }

          if (savedFolder && savedFolder !== "null")
            setCurrentFolderId(savedFolder);
          if (savedHistory) setFolderHistory(JSON.parse(savedHistory));
        } else {
          const savedUser = await AsyncStorage.getItem("rv_user");
          const savedToken = await AsyncStorage.getItem("rv_token");
          const savedFolder = await AsyncStorage.getItem("rv_folder");
          const savedHistory = await AsyncStorage.getItem("rv_history");

          if (savedUser && savedToken) {
            setCurrentUser(JSON.parse(savedUser));
            setAuthToken(savedToken);
          }

          if (savedFolder && savedFolder !== "null")
            setCurrentFolderId(savedFolder);
          if (savedHistory) setFolderHistory(JSON.parse(savedHistory));
        }
      } catch (error) {
        console.log("Error loading saved auth:", error);
      }
    };

    loadSavedAuth();
  }, []);

  // --- REAL-TIME WEBSOCKET ENGINE ---
  useEffect(() => {
    if (!currentUser) return;

    const socket = io(BASE_URL);
    socket.emit("join_vault", currentUser.id);

    socket.on("vault_updated", () => {
      if (
        isOcrModalOpen ||
        isRenameModalOpen ||
        isShareModalOpen ||
        isFolderModalOpen
      )
        return;
      if (isViewingShared) loadSharedItems();
      else loadVault(currentFolderId);
    });

    return () => socket.disconnect();
  }, [
    currentUser,
    currentFolderId,
    isViewingShared,
    isOcrModalOpen,
    isRenameModalOpen,
    isShareModalOpen,
    isFolderModalOpen,
  ]);

  useEffect(() => {
    if (Platform.OS === "web") {
      if (currentFolderId) sessionStorage.setItem("rv_folder", currentFolderId);
      sessionStorage.setItem("rv_history", JSON.stringify(folderHistory));
    }
  }, [currentFolderId, folderHistory]);

  const enterFolder = (folderId) => {
    setFolderHistory((prev) => [...prev, currentFolderId]);
    setCurrentFolderId(folderId);
  };

  const goBack = () => {
    if (
      isViewingShared &&
      folderHistory[folderHistory.length - 1] === "SHARED_ROOT"
    ) {
      setIsViewingShared(false);
      setActiveTab("shared");
      setFolderHistory([]);
      setCurrentFolderId(null);
      loadSharedItems();
      return;
    }

    const newHistory = [...folderHistory];
    const previousFolderId = newHistory.pop();
    setFolderHistory(newHistory);
    setCurrentFolderId(previousFolderId || null);
    loadVault(previousFolderId || null);
  };

  const openContextMenu = (item) => {
    if (activeTab === "shared" || isViewingShared) {
      showToast("❌ You cannot modify shared files.");
      return;
    }
    setActiveOptionsItem(item);
  };

  const handleItemPress = (item) => {
    if (item.type === "folder" || item.itemType === "folder") {
      const targetId = item.itemId || item.id;
      if (activeTab === "shared") {
        setIsViewingShared(true);
        setActiveTab("home");
        setFolderHistory(["SHARED_ROOT"]);
        setCurrentFolderId(targetId);
        loadVault(targetId);
      } else {
        setFolderHistory((prev) => [...prev, currentFolderId]);
        setCurrentFolderId(targetId);
        loadVault(targetId);
      }
    } else {
      setActiveViewerItem({
        ...item,
        filename: item.filename,
        fileType: item.fileType,
        type: "file",
      });
    }
  };

  const handleLongPress = (id) => {
    if (!isSelectionMode) {
      setIsSelectionMode(true);
      setSelectedIds(new Set([id]));
    }
  };

  const executeDelete = async () => {
    showToast(`⏳ Deleting ${selectedIds.size} items...`);
    try {
      await vaultApi.bulkDelete(Array.from(selectedIds), currentUser.id);
      setIsSelectionMode(false);
      setSelectedIds(new Set());
      loadVault(currentFolderId);
      showToast("✅ Items deleted successfully!");
    } catch (error) {
      showToast("❌ Failed to delete items.");
    }
  };

  const handleBulkDelete = () => {
    if (Platform.OS === "web") {
      if (
        window.confirm(
          `Are you sure you want to permanently delete ${selectedIds.size} items?`,
        )
      )
        executeDelete();
    } else {
      Alert.alert(
        "Delete Multiple Items",
        `Are you sure you want to permanently delete ${selectedIds.size} items?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: executeDelete },
        ],
      );
    }
  };

  const handleBulkMove = async () => {
    try {
      const folders = await vaultApi.getAllFolders();
      setAllFolders(Array.isArray(folders) ? folders : []);
      setIsMoveModalOpen(true);
    } catch (e) {
      showToast("❌ Could not load folders.");
    }
  };
  const openMoveOrCopyModal = async (mode: "move" | "copy", item?: any) => {
    try {
      const folders = await vaultApi.getAllFolders();
      const withRoot = [
        { id: "root", itemId: "root", name: "📁 Root Vault" },
        ...(Array.isArray(folders) ? folders : []),
      ];
      setAllFolders(withRoot);
      if (item) setActiveOptionsItem(item);
      if (mode === "move") setIsMoveModalOpen(true);
      else setIsCopyModalOpen(true);
    } catch (e) {
      showToast("❌ Could not load folders.");
    }
  };
  const handleCreatePdf = async () => {
    const selectedItems = vaultItems.filter(
      (item) => selectedIds.has(item.id) && item.fileType?.startsWith("image/"),
    );
    if (selectedItems.length === 0) {
      showToast("❌ Please select at least one image to create a PDF.");
      return;
    }

    let pdfName = "Merged_Document";
    if (Platform.OS === "web") {
      const userInput = window.prompt(
        "Enter a name for your new PDF:",
        "Merged_Document",
      );
      if (!userInput) return;
      pdfName = userInput;
    }

    showToast(`⏳ Stitching ${selectedItems.length} images into a PDF...`);
    try {
      const filenames = selectedItems.map((item) => item.filename);
      await vaultApi.imagesToPdf(
        filenames,
        pdfName,
        currentUser.id,
        currentFolderId,
      );

      setIsSelectionMode(false);
      setSelectedIds(new Set());
      loadVault(currentFolderId);
      showToast("✅ PDF created successfully!");
    } catch (error) {
      showToast("❌ Failed to create PDF.");
    }
  };

  const handleDownload = async (item) => {
    if (!item) return;

    const isFolder = item.type === "folder";
    const fileUrl = isFolder
      ? `${BASE_URL}/download-folder/${item.id}/${currentUser.id}`
      : `${BASE_URL}/uploads/${item.filename}`;

    const cleanName = isFolder
      ? `${item.name}.zip`
      : item.filename.includes("-")
        ? item.filename.split("-").slice(1).join("-")
        : item.filename;

    if (Platform.OS === "web") {
      showToast(isFolder ? "⏳ Zipping folder..." : "⏳ Preparing download...");
      try {
        const response = await fetch(fileUrl);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = cleanName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);

        showToast("✅ Download complete!");
      } catch (error) {
        showToast("❌ Web download failed.");
      }
    } else {
      showToast(
        isFolder
          ? "⏳ Zipping & Downloading..."
          : "⏳ Downloading to device...",
      );
      try {
        let safePathName = cleanName.replace(/[^a-zA-Z0-9.]/g, "_");

        if (!isFolder && !safePathName.includes(".")) {
          if (item.fileType?.startsWith("image/jpeg")) safePathName += ".jpg";
          else if (item.fileType?.startsWith("image/png"))
            safePathName += ".png";
          else if (item.fileType?.endsWith("pdf")) safePathName += ".pdf";
          else safePathName += ".txt";
        }

        const localUri = FileSystem.documentDirectory + safePathName;
        const { uri } = await FileSystem.downloadAsync(
          encodeURI(fileUrl),
          localUri,
        );

        await Sharing.shareAsync(uri, {
          mimeType: isFolder ? "application/zip" : item.fileType || "*/*",
          UTI: isFolder
            ? "public.zip-archive"
            : item.fileType?.startsWith("image/")
              ? "public.image"
              : "public.content",
          dialogTitle: `Save ${safePathName}`,
        });
      } catch (error) {
        console.error("Mobile Download Error:", error);
        showToast("❌ Mobile download failed.");
      }
    }

    setActiveOptionsItem(null);
  };

  const handleExtractPdfImages = async () => {
    if (!activeOptionsItem || !activeOptionsItem.filename.endsWith(".pdf"))
      return;

    showToast("⏳ Extracting pages to images (This might take a moment)...");
    const itemToExtract = activeOptionsItem;
    setActiveOptionsItem(null);

    try {
      const data = await vaultApi.pdfToImages(
        itemToExtract.filename,
        currentUser.id,
        currentFolderId,
      );
      loadVault(currentFolderId);
      showToast(`✅ Extracted ${data.count} images successfully!`);
    } catch (error) {
      showToast("❌ Failed to extract images.");
    }
  };

  const handleMediaUpload = async (pickerResult, isDocument = false) => {
    setIsMenuOpen(false);
    if (pickerResult?.canceled || !pickerResult?.assets?.length) return;

    for (const asset of pickerResult.assets) {
      const actualFilename =
        asset.fileName ||
        asset.name ||
        asset.uri?.split("/").pop() ||
        "upload.file";

      const uploadId =
        Date.now().toString() +
        "-" +
        Math.random().toString(36).substring(7) +
        "-" +
        actualFilename;

      setActiveUploads((prev) => ({
        ...prev,
        [uploadId]: { filename: actualFilename, progress: 1 },
      }));

      try {
        const formData = new FormData();

        if (Platform.OS === "web") {
          const responseFromUri = await fetch(asset.uri);
          const blob = await responseFromUri.blob();
          formData.append("mediaFile", blob, actualFilename);
        } else {
          const lower = actualFilename.toLowerCase();
          const fallbackType =
            asset.mimeType ||
            (lower.endsWith(".png")
              ? "image/png"
              : lower.endsWith(".jpg") || lower.endsWith(".jpeg")
                ? "image/jpeg"
                : lower.endsWith(".mp4")
                  ? "video/mp4"
                  : lower.endsWith(".pdf")
                    ? "application/pdf"
                    : lower.endsWith(".txt")
                      ? "text/plain"
                      : lower.endsWith(".doc")
                        ? "application/msword"
                        : lower.endsWith(".docx")
                          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                          : lower.endsWith(".zip")
                            ? "application/zip"
                            : isDocument
                              ? "application/octet-stream"
                              : "image/jpeg");

          formData.append("mediaFile", {
            uri: asset.uri,
            name: actualFilename,
            type: fallbackType,
          } as any);
        }

        if (currentFolderId) formData.append("folderId", currentFolderId);
        if (currentUser?.id) formData.append("uploaderId", currentUser.id);
        formData.append("enableAI", String(isAiEnabled));

        await uploadWithProgress(formData, uploadId);

        setServerMessage("Files successfully vaulted.");
        loadVault(currentFolderId);
      } catch (error) {
        console.log("Upload error:", error);
        setServerMessage(`Upload failed: ${actualFilename}`);
      } finally {
        setTimeout(() => {
          setActiveUploads((prev) => {
            const copy = { ...prev };
            delete copy[uploadId];
            return copy;
          });
        }, 1000);
      }
    }
  };

  const uploadWithProgress = (formData, uploadId) => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${BASE_URL}/upload`);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.min(
            99,
            Math.round((event.loaded / event.total) * 100),
          );
          setActiveUploads((prev) => ({
            ...prev,
            [uploadId]: { ...prev[uploadId], progress: percentComplete },
          }));
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setActiveUploads((prev) => ({
            ...prev,
            [uploadId]: { ...prev[uploadId], progress: 100 },
          }));
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch {
            resolve(xhr.responseText);
          }
        } else {
          console.log("Upload failed status:", xhr.status);
          console.log("Upload failed body:", xhr.responseText);
          reject(new Error(`Upload failed (${xhr.status})`));
        }
      };

      xhr.onerror = () => {
        console.log("Upload network error");
        reject(new Error("Network error"));
      };

      xhr.send(formData);
    });
  };

  const handleShare = async (isPublic) => {
    if (!isPublic && !shareUsername.trim()) return;

    try {
      const data = await vaultApi.shareItem(
        activeOptionsItem.id,
        activeOptionsItem.type,
        currentUser.id,
        isPublic ? null : shareUsername,
      );
      if (isPublic) {
        if (Platform.OS === "web") navigator.clipboard.writeText(data.link);
        showToast(`✅ Public Link Created: ${data.link}`);
      } else {
        showToast(`✅ ${data.message}`);
      }
    } catch (error) {
      showToast("❌ Failed to share.");
    }

    setIsShareModalOpen(false);
    setActiveOptionsItem(null);
    setShareUsername("");
  };

  const createFolder = async () => {
    if (!newFolderName.trim() || !currentUser) return;

    setIsFolderModalOpen(false);
    showToast("⏳ Creating folder...");

    try {
      await vaultApi.createFolder(
        newFolderName,
        currentFolderId,
        currentUser.id,
      );
      setNewFolderName("");
      loadVault(currentFolderId);
      showToast("✅ Folder created.");
    } catch (error) {
      showToast("❌ Failed to create folder.");
    }
  };

  const getFileIcon = (fileType) => {
    if (!fileType) return "📄";
    if (fileType.includes("pdf")) return "📕";
    if (fileType.includes("zip") || fileType.includes("tar")) return "📦";
    if (fileType.includes("video")) return "🎬";
    if (fileType.includes("audio")) return "🎵";
    if (fileType.includes("word") || fileType.includes("document")) return "📝";
    return "📄";
  };

  const handleCompress = async () => {
    if (!activeOptionsItem) return;
    setIsProcessingArchive(true);
    showToast("🗜️ Compressing... this may take a moment.");
    try {
      const res = await vaultApi.compress({
        targetName: activeOptionsItem.filename || activeOptionsItem.name,
        isFolder: activeOptionsItem.type === "folder",
        itemId: activeOptionsItem.id,
        currentFolderId,
        userId: currentUser.id,
      });
      const text = await res.text();
      console.log("Compress response:", res.status, text);
      if (res.ok) {
        showToast("✅ Compressed!");
        loadVault(currentFolderId);
      } else throw new Error();
    } catch (err: any) {
      console.log("Compress error:", err);
      showToast(`❌ Failed to compress: ${err?.message || "Unknown error"}`);
    }
    setIsProcessingArchive(false);
    setActiveOptionsItem(null);
  };

  const handleExtract = async () => {
    if (!activeOptionsItem) return;
    setIsProcessingArchive(true);
    showToast("📦 Extracting...");
    try {
      const res = await vaultApi.extract({
        filename: activeOptionsItem.filename,
        currentFolderId,
        userId: currentUser.id,
      });
      if (res.ok) {
        showToast("✅ Extracted!");
        loadVault(currentFolderId);
      } else throw new Error();
    } catch {
      showToast("❌ Failed to extract.");
    }
    setIsProcessingArchive(false);
    setActiveOptionsItem(null);
  };

  const handleDelete = async () => {
    if (!activeOptionsItem) return;
    setIsProcessingArchive(true);
    showToast("🗑️ Deleting...");
    try {
      const res = await vaultApi.delete({
        itemId: activeOptionsItem.id,
        isFolder: activeOptionsItem.type === "folder",
        filename: activeOptionsItem.filename,
        userId: currentUser.id,
      });
      if (res.ok) {
        showToast("✅ Deleted!");
        loadVault(currentFolderId);
      } else throw new Error();
    } catch {
      showToast("❌ Failed to delete.");
    }
    setIsProcessingArchive(false);
    setActiveOptionsItem(null);
  };

  const submitRename = async (newNameArg?: string) => {
    const finalName = (newNameArg ?? renameText).trim();
    if (!finalName || !activeOptionsItem) return;
    setIsRenameModalOpen(false);
    showToast("✏️ Renaming...");
    try {
      const res = await vaultApi.rename({
        itemId: activeOptionsItem.id,
        isFolder: activeOptionsItem.type === "folder",
        oldName: activeOptionsItem.filename || activeOptionsItem.name,
        newName: finalName,
        userId: currentUser.id,
      });
      if (res.ok) {
        showToast("✅ Renamed!");
        loadVault(currentFolderId);
      } else throw new Error();
    } catch {
      showToast("❌ Failed to rename.");
    }
    setActiveOptionsItem(null);
  };

  const submitCopy = async (destinationArg?: any, itemArg?: any) => {
    const item = itemArg ?? activeOptionsItem;
    let destinationFolderId = normalizeId(destinationArg);
    if (destinationFolderId === "root") destinationFolderId = null;
    const itemId = normalizeId(item);

    if (!itemId || (!destinationFolderId && destinationFolderId !== null)) {
      showToast("❌ Invalid destination.");
      return;
    }

    setIsCopyModalOpen(false);
    showToast("📄 Copying...");
    try {
      const res = await vaultApi.copy({
        itemId,
        isFolder: (item.type || item.itemType) === "folder",
        filename: item.filename,
        destinationFolderId,
        userId: currentUser.id,
      });
      if (!res.ok) throw new Error();
      showToast("✅ Copied!");
      await loadVault(currentFolderId);
    } catch {
      showToast("❌ Failed to copy.");
    }
    setActiveOptionsItem(null);
  };

  const submitMove = async (destinationArg?: any, itemArg?: any) => {
    let destinationFolderId = normalizeId(destinationArg);
    if (destinationFolderId === "root") destinationFolderId = null;
    const item = itemArg ?? activeOptionsItem;

    if (!destinationFolderId && destinationFolderId !== null) {
      showToast("❌ Invalid destination.");
      return;
    }

    setIsMoveModalOpen(false);
    try {
      if (isSelectionMode) {
        showToast(`⏳ Moving ${selectedIds.size} items...`);
        await vaultApi.bulkMove(
          Array.from(selectedIds),
          destinationFolderId,
          currentUser.id,
        );
        setIsSelectionMode(false);
        setSelectedIds(new Set());
        showToast("✅ Items moved successfully!");
      } else {
        const itemId = normalizeId(item);
        if (!itemId) {
          showToast("❌ Invalid item.");
          return;
        }

        showToast("⏳ Moving item...");
        await vaultApi.move({
          itemId,
          isFolder: (item.type || item.itemType) === "folder",
          filename: item.filename,
          destinationFolderId,
          userId: currentUser.id,
        });
        setActiveOptionsItem(null);
        showToast("✅ Item moved successfully!");
      }

      await loadVault(currentFolderId);
    } catch {
      showToast("❌ Move failed.");
    }
  };

  const handleExtractText = async () => {
    if (!activeOptionsItem) return;

    setIsProcessingArchive(true);
    showToast("🧠 AI is reading the image...");

    try {
      const data = await vaultApi.extractText(activeOptionsItem.filename);
      showToast("✅ Scan complete!");

      const baseName = activeOptionsItem.filename
        .split("-")
        .slice(1)
        .join("-")
        .split(".")[0];
      setOcrFilename(`${baseName}_Text`);
      setOcrText(data.text);
      setIsOcrModalOpen(true);
    } catch {
      showToast("❌ AI failed to read image.");
    }

    setIsProcessingArchive(false);
    setActiveOptionsItem(null);
  };

  const saveOcrDocument = async (nameArg?: string, textArg?: string) => {
    const finalName = (nameArg ?? ocrFilename).trim();
    const finalText = (textArg ?? ocrText).trim();

    if (!finalName || !finalText || !currentUser?.id) {
      showToast("❌ Missing filename or content.");
      return;
    }

    setIsOcrModalOpen(false);
    showToast("📝 Saving document...");

    try {
      const res = await fetch(`${BASE_URL}/create-document`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: finalName.endsWith(".txt") ? finalName : `${finalName}.txt`,
          content: finalText,
          currentFolderId,
          userId: currentUser.id,
        }),
      });

      if (res.ok) {
        showToast("✅ Document saved!");
        setOcrFilename("");
        setOcrText("");
        loadVault(currentFolderId);
      } else {
        const err = await res.text();
        console.log("saveOcrDocument failed:", err);
        throw new Error(err);
      }
    } catch (e) {
      console.log("saveOcrDocument error:", e);
      showToast("❌ Failed to save document.");
    }
  };

  const currentSearch = useRef("");
  const searchTimeoutRef = useRef<any>(null);
  const latestSearchReqId = useRef(0);
  const isModalTypingRef = useRef(false);
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  const handleSearch = (text) => {
    if (isModalTypingRef.current) return;
    setSearchQuery(text);
    currentSearch.current = text;

    // Clear previous pending debounce timer
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    const cleanText = text.trim();

    // Instant reset when empty
    if (cleanText === "") {
      setIsSearching(false);
      loadVault(currentFolderId);
      return;
    }

    setIsSearching(true);

    searchTimeoutRef.current = setTimeout(async () => {
      const reqId = ++latestSearchReqId.current;

      try {
        const data = await vaultApi.searchVault(cleanText);

        // Ignore stale responses
        if (reqId !== latestSearchReqId.current) return;

        // Keep only if query still matches current input
        if (currentSearch.current.trim() === cleanText) {
          setVaultItems(data.files);
        }
      } catch (error) {
        if (reqId !== latestSearchReqId.current) return;
        console.log("Search error:", error);
      } finally {
        if (reqId === latestSearchReqId.current) {
          setIsSearching(false);
        }
      }
    }, 200);
  };

  const renderVaultItem = ({ item }) => {
    const isSelected = selectedIds.has(item.id);
    const selectionStyle = isSelected
      ? { borderWidth: 2, borderColor: colors.tint }
      : {};

    if (item.type === "folder") {
      return (
        <TouchableOpacity
          style={[styles.gridItemCard, { width: itemWidth }, selectionStyle]}
          onPress={() => handleItemPress(item)}
          onLongPress={() => handleLongPress(item.id)}
          delayLongPress={450}
        >
          {!(activeTab === "shared" || isViewingShared) && (
            <TouchableOpacity
              style={styles.threeDotButton}
              onPress={() => openContextMenu(item)}
            >
              <Text style={styles.threeDotText}>⋯</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.folderIcon}>📁</Text>
          <Text style={styles.itemText} numberOfLines={1}>
            {item.name}
          </Text>
        </TouchableOpacity>
      );
    }

    const safeFilename = item.filename || "unknown.file";
    const fullImageUrl = `${BASE_URL}/uploads/${encodeURIComponent(safeFilename)}`;
    const displayName = safeFilename.includes("-")
      ? safeFilename.split("-").slice(1).join("-")
      : safeFilename;
    const safeFileType = item.fileType || "unknown";
    const isImage = safeFileType.startsWith("image/");

    return (
      <TouchableOpacity
        style={[styles.gridItemCard, { width: itemWidth }, selectionStyle]}
        onPress={() => handleItemPress(item)}
        onLongPress={() => handleLongPress(item.id)}
        delayLongPress={450}
      >
        {!(activeTab === "shared" || isViewingShared) && (
          <TouchableOpacity
            style={styles.threeDotButton}
            onPress={() => openContextMenu(item)}
          >
            <Text style={styles.threeDotText}>⋯</Text>
          </TouchableOpacity>
        )}

        {isImage ? (
          <Image
            source={{ uri: fullImageUrl }}
            style={styles.thumb}
            resizeMode="cover"
          />
        ) : safeFileType.startsWith("video/") ? (
          <VideoThumbnail videoUrl={fullImageUrl} />
        ) : (
          <View style={styles.fileFallback}>
            <Text style={{ fontSize: 34 }}>
              {typeof getFileIcon === "function"
                ? getFileIcon(safeFileType)
                : "📄"}
            </Text>
          </View>
        )}

        <Text style={styles.itemText} numberOfLines={1}>
          {displayName}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderReelItem = ({ item, index }) => {
    const fullMediaUrl = `${BASE_URL}/uploads/${encodeURIComponent(item.filename)}`;
    const isImage = item.fileType.startsWith("image/");
    const isActive = index === activeReelIndex;

    return (
      <View style={[styles.reelItemContainer, { height: screenHeight }]}>
        {isImage ? (
          <Image
            source={{ uri: fullMediaUrl }}
            style={styles.reelMedia}
            resizeMode="contain"
          />
        ) : (
          <>
            <Video
              source={{ uri: fullMediaUrl }}
              style={styles.reelMedia}
              useNativeControls={false}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay={isActive}
              isLooping
              isMuted={isMuted}
              progressUpdateIntervalMillis={isActive ? 100 : 1000}
            />
            <TouchableOpacity
              style={styles.muteFab}
              onPress={() => setIsMuted(!isMuted)}
            >
              <Text style={{ fontSize: 22 }}>{isMuted ? "🔇" : "🔊"}</Text>
            </TouchableOpacity>
          </>
        )}

        <View style={styles.reelOverlay}>
          <Text style={styles.reelFilename}>
            {item.filename.split("-").slice(1).join("-")}
          </Text>
          {!isActive && !isImage && (
            <Text style={{ color: colors.subtext, fontSize: 12 }}>
              Paused in background...
            </Text>
          )}
        </View>
      </View>
    );
  };

  const vaultModalProps = useMemo(
    () => ({
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
      setIsModalTyping: (v: boolean) => {
        isModalTypingRef.current = v;
      },
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
    }),
    [
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
    ],
  );

  return (
    <View style={styles.container}>
      {toast && (
        <View style={styles.globalToast}>
          <Text style={styles.globalToastText}>{toast}</Text>
        </View>
      )}

      {!currentUser ? (
        <AuthScreen
          showToast={showToast}
          onAuthSuccess={async (user, token) => {
            setCurrentUser(user);
            setAuthToken(token);

            if (Platform.OS === "web") {
              sessionStorage.setItem("rv_token", token);
              sessionStorage.setItem("rv_user", JSON.stringify(user));
            } else {
              await AsyncStorage.setItem("rv_token", token);
              await AsyncStorage.setItem("rv_user", JSON.stringify(user));
            }
          }}
        />
      ) : (
        <View style={{ flex: 1, width: "100%" }}>
          {/* Header */}
          <Glass isDark={isDark} style={styles.header}>
            <View style={styles.headerLeft}>
              {folderHistory.length > 0 && viewMode === "grid" ? (
                <TouchableOpacity onPress={goBack} style={styles.backButton}>
                  <Text style={styles.backButtonText}>‹ Back</Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.title}>ReelVault</Text>
              )}
            </View>

            {(!isMobile || isMobileSearchOpen) && (
              <View style={styles.headerCenter}>
                <TextInput
                  style={styles.magicSearchBar}
                  placeholder="🔍 Search tags or files..."
                  placeholderTextColor={colors.subtext}
                  value={searchQuery}
                  onChangeText={handleSearch}
                  autoFocus={isMobileSearchOpen}
                />
              </View>
            )}

            <View style={styles.headerRight}>
              {isMobile && (
                <TouchableOpacity
                  style={[
                    styles.chipBtn,
                    isMobileSearchOpen && { backgroundColor: colors.danger },
                  ]}
                  onPress={() => {
                    setIsMobileSearchOpen(!isMobileSearchOpen);
                    if (isMobileSearchOpen) handleSearch("");
                  }}
                >
                  <Text style={styles.chipText}>
                    {isMobileSearchOpen ? "Cancel" : "🔍"}
                  </Text>
                </TouchableOpacity>
              )}

              {!isMobile && (
                <Text style={styles.message}>
                  {isSearching ? "Searching…" : serverMessage}
                </Text>
              )}

              {(!isMobile || !isMobileSearchOpen) && (
                <>
                  <TouchableOpacity
                    style={styles.chipBtn}
                    onPress={() =>
                      setViewMode(viewMode === "grid" ? "reel" : "grid")
                    }
                  >
                    <Text style={styles.chipText}>
                      {viewMode === "grid" ? "🎬 Reel" : "⏹️ Grid"}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.addButton}
                    onPress={() => setIsMenuOpen(!isMenuOpen)}
                  >
                    <Text style={styles.addButtonText}>+</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </Glass>

          {Object.keys(activeUploads).length > 0 && (
            <View style={styles.progressQueueContainer}>
              {Object.entries(activeUploads).map(([id, upload]: any) => (
                <View key={id} style={styles.singleProgressContainer}>
                  <View style={styles.progressTextRow}>
                    <Text style={styles.progressFilename} numberOfLines={1}>
                      {upload.filename}
                    </Text>
                    <Text style={styles.progressPercent}>
                      {upload.progress}%
                    </Text>
                  </View>
                  <View style={styles.progressBarBackground}>
                    <View
                      style={[
                        styles.progressBarFill,
                        { width: `${upload.progress}%` },
                      ]}
                    />
                  </View>
                </View>
              ))}
            </View>
          )}

          {isMenuOpen && (
            <Glass isDark={isDark} style={styles.actionMenu}>
              <View style={styles.profileBlock}>
                <Text style={styles.profileSub}>Logged in as</Text>
                <Text style={styles.profileName}>@{currentUser?.username}</Text>
              </View>
              <View style={styles.menuDivider} />

              <TouchableOpacity
                style={styles.actionItem}
                onPress={() => setIsAiEnabled(!isAiEnabled)}
              >
                <Text
                  style={[
                    styles.actionItemText,
                    {
                      color: isAiEnabled ? colors.success : colors.subtext,
                      fontWeight: "700",
                    },
                  ]}
                >
                  {isAiEnabled ? "🧠 AI Vision: ON" : "💤 AI Vision: OFF"}
                </Text>
              </TouchableOpacity>
              <View style={styles.menuDivider} />

              <TouchableOpacity
                style={styles.actionItem}
                onPress={() => {
                  setIsMenuOpen(false);
                  setIsFolderModalOpen(true);
                }}
              >
                <Text style={styles.actionItemText}>📁 New Folder</Text>
              </TouchableOpacity>
              <View style={styles.menuDivider} />

              <TouchableOpacity
                style={styles.actionItem}
                onPress={async () => {
                  const result = await ImagePicker.launchImageLibraryAsync({
                    mediaTypes: ["images", "videos"] as any,
                    allowsMultipleSelection: true,
                    quality: 1,
                  });
                  handleMediaUpload(result);
                }}
              >
                <Text style={styles.actionItemText}>📷 Upload Photos</Text>
              </TouchableOpacity>
              <View style={styles.menuDivider} />

              <TouchableOpacity
                style={styles.actionItem}
                onPress={async () => {
                  const result = await DocumentPicker.getDocumentAsync({
                    type: "*/*",
                    copyToCacheDirectory: true,
                    multiple: true,
                  });
                  handleMediaUpload(result, true);
                }}
              >
                <Text style={styles.actionItemText}>📄 Upload Files</Text>
              </TouchableOpacity>
              <View style={styles.menuDivider} />

              {currentUser?.username === "admin" && (
                <>
                  <TouchableOpacity
                    style={styles.actionItem}
                    onPress={() => {
                      setIsMenuOpen(false);
                      setIsAdminOpen(true);
                    }}
                  >
                    <Text
                      style={[styles.actionItemText, { color: colors.tint }]}
                    >
                      ⚙️ Admin Panel
                    </Text>
                  </TouchableOpacity>
                  <View style={styles.menuDivider} />
                </>
              )}
              <TouchableOpacity
                style={styles.actionItem}
                onPress={async () => {
                  setIsMenuOpen(false);
                  setCurrentUser(null);
                  setVaultItems([]);
                  setFolderHistory([]);
                  setCurrentFolderId(null);
                  setAuthToken(null);

                  if (Platform.OS === "web") {
                    sessionStorage.removeItem("rv_folder");
                    sessionStorage.removeItem("rv_history");
                    sessionStorage.removeItem("rv_user");
                    sessionStorage.removeItem("rv_token");
                  } else {
                    await AsyncStorage.removeItem("rv_folder");
                    await AsyncStorage.removeItem("rv_history");
                    await AsyncStorage.removeItem("rv_user");
                    await AsyncStorage.removeItem("rv_token");
                  }
                }}
              >
                <Text style={[styles.actionItemText, { color: colors.danger }]}>
                  🚪 Logout
                </Text>
              </TouchableOpacity>
            </Glass>
          )}

          <VaultModals {...vaultModalProps} />

          <View style={{ flex: 1 }}>
            {viewMode === "grid" ? (
              <FlatList
                key={`grid-view-${numCols}`}
                data={activeTab === "shared" ? sharedItems : vaultItems}
                keyExtractor={(item) => item.id}
                renderItem={renderVaultItem}
                numColumns={numCols}
                contentContainerStyle={styles.gridContainer}
                columnWrapperStyle={numCols > 1 ? { gap: itemGap } : undefined}
                showsVerticalScrollIndicator={false}
              />
            ) : (
              <FlatList
                key="reel-view-clean"
                data={(activeTab === "shared"
                  ? sharedItems
                  : vaultItems
                ).filter(
                  (item) =>
                    item.type === "file" &&
                    (item.fileType?.startsWith("image/") ||
                      item.fileType?.startsWith("video/")),
                )}
                keyExtractor={(item) => item.id}
                renderItem={renderReelItem}
                showsVerticalScrollIndicator={false}
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={viewabilityConfig}
                windowSize={3}
                initialNumToRender={1}
                maxToRenderPerBatch={1}
                removeClippedSubviews
                snapToInterval={screenHeight}
                snapToAlignment="start"
                decelerationRate="fast"
                disableIntervalMomentum
                getItemLayout={(_, index) => ({
                  length: screenHeight,
                  offset: screenHeight * index,
                  index,
                })}
              />
            )}
          </View>

          <FileViewer
            item={activeViewerItem}
            onClose={() => setActiveViewerItem(null)}
            showToast={showToast}
            onDownload={handleDownload}
            getFileIcon={getFileIcon}
            toastMessage={toast}
          />

          {isSelectionMode && (
            <View style={styles.bulkActionBar}>
              <TouchableOpacity
                onPress={() => {
                  setIsSelectionMode(false);
                  setSelectedIds(new Set());
                }}
              >
                <Text style={styles.bulkActionTextCancel}>Cancel</Text>
              </TouchableOpacity>

              <Text style={styles.bulkActionCount}>
                {selectedIds.size} Selected
              </Text>

              <View style={{ flexDirection: "row", gap: 16 }}>
                <TouchableOpacity onPress={handleBulkMove}>
                  <Text style={styles.bulkActionIcon}>🚚</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleBulkDelete}>
                  <Text style={styles.bulkActionIcon}>🗑️</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleCreatePdf}>
                  <Text style={styles.bulkActionIcon}>📄</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Bottom Tabs */}
          <Glass isDark={isDark} style={styles.tabBar}>
            <TouchableOpacity
              style={styles.tabItem}
              onPress={() => {
                setActiveTab("home");
                setIsViewingShared(false);
                loadVault(currentFolderId);
              }}
            >
              <Text
                style={[
                  styles.tabIcon,
                  activeTab === "home" && { color: colors.tint },
                ]}
              >
                🏠
              </Text>
              <Text
                style={[
                  styles.tabLabel,
                  activeTab === "home" && { color: colors.tint },
                ]}
              >
                Vault
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.tabItem}
              onPress={() => {
                setActiveTab("shared");
                loadSharedItems();
              }}
            >
              <Text
                style={[
                  styles.tabIcon,
                  activeTab === "shared" && { color: colors.tint },
                ]}
              >
                🤝
              </Text>
              <Text
                style={[
                  styles.tabLabel,
                  activeTab === "shared" && { color: colors.tint },
                ]}
              >
                Shared
              </Text>
            </TouchableOpacity>
          </Glass>
        </View>
      )}
      {Platform.OS === "web" && isAdminOpen && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
            backgroundColor: colors.bg,
            width: "100%",
            height: "100%",
          }}
        >
          <AdminPanel onClose={() => setIsAdminOpen(false)} />
        </View>
      )}
    </View>
  );
}

const makeStyles = (colors, isDark) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg, paddingTop: 40 },

    header: {
      marginHorizontal: 14,
      marginBottom: 12,
      borderRadius: 18,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: isDark
        ? "rgba(28,28,30,0.75)"
        : "rgba(255,255,255,0.75)",
      minHeight: 66,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 14,
      zIndex: 100,
    },
    headerLeft: { flex: 1, alignItems: "flex-start" },
    headerCenter: { flex: 1.3, alignItems: "center" },
    headerRight: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: 8,
    },

    backButton: { paddingVertical: 6, paddingHorizontal: 2 },
    backButtonText: { color: colors.tint, fontSize: 17, fontWeight: "600" },
    title: { fontSize: 21, color: colors.text, fontWeight: "700" },
    message: { fontSize: 12, color: colors.subtext, marginRight: 8 },

    magicSearchBar: {
      backgroundColor: colors.input,
      color: colors.text,
      width: "100%",
      maxWidth: 460,
      paddingVertical: 9,
      paddingHorizontal: 14,
      borderRadius: 18,
      fontSize: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },

    chipBtn: {
      backgroundColor: colors.card2,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 14,
    },
    chipText: { color: colors.text, fontSize: 12, fontWeight: "700" },

    addButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.tint,
      justifyContent: "center",
      alignItems: "center",
      marginLeft: 2,
    },
    addButtonText: {
      color: "#fff",
      fontSize: 24,
      fontWeight: "400",
      lineHeight: 26,
    },

    globalToast: {
      position: "absolute",
      top: 56,
      alignSelf: "center",
      backgroundColor: colors.card2,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 18,
      zIndex: 999,
    },
    globalToastText: { color: colors.text, fontSize: 14, fontWeight: "600" },

    progressQueueContainer: {
      marginHorizontal: 14,
      marginBottom: 10,
      borderRadius: 14,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 10,
      zIndex: 40,
    },
    singleProgressContainer: { marginBottom: 10 },
    progressTextRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 6,
    },
    progressFilename: {
      color: colors.text,
      fontSize: 13,
      flex: 1,
      paddingRight: 10,
    },
    progressPercent: { color: colors.tint, fontSize: 13, fontWeight: "700" },
    progressBarBackground: {
      height: 5,
      backgroundColor: colors.card2,
      borderRadius: 3,
      overflow: "hidden",
    },
    progressBarFill: { height: "100%", backgroundColor: colors.tint },

    actionMenu: {
      position: "absolute",
      top: 92,
      right: 14,
      borderRadius: 16,
      overflow: "hidden",
      width: 220,
      zIndex: 120,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: isDark
        ? "rgba(44,44,46,0.86)"
        : "rgba(255,255,255,0.92)",
    },
    profileBlock: { padding: 12 },
    profileSub: { color: colors.subtext, fontSize: 12 },
    profileName: {
      color: colors.text,
      fontSize: 16,
      fontWeight: "700",
      marginTop: 2,
    },
    actionItem: { paddingVertical: 12, paddingHorizontal: 14 },
    actionItemText: { color: colors.text, fontSize: 15, fontWeight: "500" },
    menuDivider: { height: 1, backgroundColor: colors.border, marginLeft: 12 },

    gridContainer: { paddingHorizontal: 15, paddingTop: 4, paddingBottom: 90 },
    gridItemCard: {
      marginBottom: 14,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      padding: 10,
      alignItems: "center",
    },
    folderIcon: { fontSize: 64, marginTop: 8, marginBottom: 8 },
    thumb: {
      width: "100%",
      height: 110,
      borderRadius: 12,
      backgroundColor: "#111",
    },
    fileFallback: {
      width: "100%",
      height: 110,
      backgroundColor: colors.card2,
      borderRadius: 12,
      justifyContent: "center",
      alignItems: "center",
    },
    itemText: {
      color: colors.text,
      marginTop: 9,
      fontSize: 13,
      fontWeight: "500",
      textAlign: "center",
      width: "100%",
    },

    threeDotButton: {
      position: "absolute",
      top: 8,
      right: 8,
      width: 28,
      height: 28,
      justifyContent: "center",
      alignItems: "center",

      zIndex: 10,
      backgroundColor: isDark
        ? "rgba(28,28,30,0.96)"
        : "rgba(255,255,255,0.98)",
      borderRadius: 14,
    },
    threeDotText: {
      color: colors.text,
      fontSize: 16,
      fontWeight: "700",
      lineHeight: 16,
    },

    reelItemContainer: {
      width: "100%",
      backgroundColor: "#000",
      justifyContent: "center",
      alignItems: "center",
      overflow: "hidden",
    },
    reelMedia: { width: "100%", height: "100%" },
    muteFab: {
      position: "absolute",
      bottom: 100,
      right: 20,
      backgroundColor: "rgba(0,0,0,0.5)",
      padding: 12,
      borderRadius: 24,
      zIndex: 50,
    },
    reelOverlay: {
      position: "absolute",
      bottom: 34,
      left: 18,
      right: 18,
      backgroundColor: "rgba(0,0,0,0.45)",
      padding: 12,
      borderRadius: 12,
    },
    reelFilename: { color: "#fff", fontSize: 15, fontWeight: "700" },

    bulkActionBar: {
      position: "absolute",
      bottom: 78,
      alignSelf: "center",
      width: "92%",
      maxWidth: 420,
      backgroundColor: colors.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      zIndex: 80,
    },
    bulkActionCount: { color: colors.text, fontWeight: "700", fontSize: 16 },
    bulkActionTextCancel: {
      color: colors.tint,
      fontSize: 16,
      fontWeight: "700",
    },
    bulkActionIcon: { fontSize: 20 },

    tabBar: {
      flexDirection: "row",
      height: 66,
      marginHorizontal: 14,
      marginBottom: Platform.OS === "ios" ? 10 : 8,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
      backgroundColor: isDark
        ? "rgba(28,28,30,0.78)"
        : "rgba(255,255,255,0.82)",
    },
    tabItem: { flex: 1, alignItems: "center", justifyContent: "center" },
    tabIcon: { fontSize: 20, color: colors.subtext },
    tabLabel: {
      fontSize: 11,
      color: colors.subtext,
      marginTop: 2,
      fontWeight: "600",
    },
  });
