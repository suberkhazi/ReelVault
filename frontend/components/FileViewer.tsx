import React, { useMemo, useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Image,
  TextInput,
  Platform,
  StyleSheet,
} from "react-native";
import { ResizeMode, Video } from "expo-av";
import { BlurView } from "expo-blur";
import * as ImageManipulator from "expo-image-manipulator";
import { useAppTheme } from "../theme/useAppTheme";
import { BASE_URL } from "../services/vaultApi";

export default function FileViewer({
  item,
  onClose,
  showToast,
  onDownload,
  getFileIcon,
  toastMessage,
}) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const [localImageUri, setLocalImageUri] = useState<string | null>(null);
  const [viewerTextContent, setViewerTextContent] = useState("");
  const [isSavingImage, setIsSavingImage] = useState(false);
  const [isSavingText, setIsSavingText] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(Date.now());

  useEffect(() => {
    if (!item) return;
    setLocalImageUri(null);
    setViewerTextContent("Loading...");

    if (item.fileType?.includes("text") || item.filename?.endsWith(".txt")) {
      fetch(
        `${BASE_URL}/uploads/${encodeURIComponent(item.filename || "")}?t=${Date.now()}`,
      )
        .then((res) => res.text())
        .then((text) => setViewerTextContent(text))
        .catch(() => setViewerTextContent("Error loading text."));
    }
  }, [item]);

  const applyLocalEdit = async (action: "rotate" | "flip") => {
    if (!item) return;
    const currentUri =
      localImageUri ||
      `${BASE_URL}/uploads/${encodeURIComponent(item.filename || "")}`;
    const actions: any[] = [];
    if (action === "rotate") actions.push({ rotate: 90 });
    if (action === "flip")
      actions.push({ flip: ImageManipulator.FlipType.Horizontal });

    try {
      const result = await ImageManipulator.manipulateAsync(
        currentUri,
        actions,
        {
          compress: 1,
          format: ImageManipulator.SaveFormat.JPEG,
        },
      );
      setLocalImageUri(result.uri);
    } catch {
      showToast("❌ Edit failed.");
    }
  };

  const saveEditedImage = async () => {
    if (!localImageUri || !item) return;
    setIsSavingImage(true);
    showToast("⏳ Uploading edit...");

    try {
      const formData = new FormData();

      if (Platform.OS === "web") {
        const responseFromUri = await fetch(localImageUri);
        const blob = await responseFromUri.blob();
        formData.append("mediaFile", blob, "temp.jpg");
      } else {
        formData.append("mediaFile", {
          uri: localImageUri,
          name: "temp.jpg",
          type: "image/jpeg",
        } as any);
      }

      formData.append("originalFilename", item.filename);

      const response = await fetch(`${BASE_URL}/overwrite-media`, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: formData,
      });

      if (response.ok) {
        showToast("🖼️ Image saved!");
        setLocalImageUri(null);
        setRefreshTrigger(Date.now());
      } else {
        throw new Error("Server rejected the file");
      }
    } catch {
      showToast("❌ Failed to save image.");
    } finally {
      setIsSavingImage(false);
    }
  };

  const saveTextFile = async () => {
    if (!item) return;
    setIsSavingText(true);
    try {
      const response = await fetch(`${BASE_URL}/save-text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: item.filename,
          content: viewerTextContent,
        }),
      });

      if (!response.ok) throw new Error("Server rejected the save");
      showToast("📝 Text file saved successfully.");
    } catch {
      showToast("❌ Failed to save text.");
    } finally {
      setIsSavingText(false);
    }
  };

  if (!item) return null;

  const encodedFilename = encodeURIComponent(item.filename || "");
  const fileUrl = `${BASE_URL}/uploads/${encodedFilename}`;
  const cacheBustUrl = `${fileUrl}?t=${refreshTrigger}`;

  const safeDisplayName = item.filename?.includes("-")
    ? item.filename.split("-").slice(1).join("-")
    : item.filename || "Unknown file";

  const isImage = item.fileType?.startsWith("image/");
  const isVideo = item.fileType?.startsWith("video/");
  const isText =
    item.fileType?.includes("text") || item.filename?.endsWith(".txt");
  const isPdf = item.filename?.endsWith(".pdf");

  const HeaderGlass = ({ children }) =>
    Platform.OS === "web" ? (
      <View style={styles.webGlassHeader}>{children}</View>
    ) : (
      <BlurView
        intensity={32}
        tint={isDark ? "dark" : "light"}
        style={styles.nativeGlassHeader}
      >
        {children}
      </BlurView>
    );

  return (
    <Modal visible={!!item} transparent animationType="slide">
      <View style={styles.viewerContainer}>
        {toastMessage ? (
          <View style={styles.globalToast}>
            <Text style={styles.globalToastText}>{toastMessage}</Text>
          </View>
        ) : null}

        <HeaderGlass>
          <View style={styles.viewerHeader}>
            <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
              <Text style={styles.viewerCloseText}>Close</Text>
            </TouchableOpacity>

            <Text style={styles.viewerTitle} numberOfLines={1}>
              {safeDisplayName}
            </Text>

            <View style={styles.rightActions}>
              {isImage && (
                <>
                  <TouchableOpacity
                    onPress={() => applyLocalEdit("rotate")}
                    style={styles.iconBtn}
                  >
                    <Text style={styles.viewerActionIcon}>↺</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => applyLocalEdit("flip")}
                    style={styles.iconBtn}
                  >
                    <Text style={styles.viewerActionIcon}>⇄</Text>
                  </TouchableOpacity>

                  {localImageUri && (
                    <TouchableOpacity
                      onPress={saveEditedImage}
                      style={styles.headerBtn}
                    >
                      <Text style={styles.viewerSaveText}>
                        {isSavingImage ? "Saving..." : "Save"}
                      </Text>
                    </TouchableOpacity>
                  )}
                </>
              )}

              {isText && (
                <TouchableOpacity
                  onPress={saveTextFile}
                  style={styles.headerBtn}
                >
                  <Text style={styles.viewerSaveText}>
                    {isSavingText ? "Saving..." : "Save"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </HeaderGlass>

        <View style={styles.viewerBody}>
          {isImage && (
            <Image
              source={{ uri: localImageUri || cacheBustUrl }}
              style={styles.viewerImage}
              resizeMode="contain"
            />
          )}
          {isVideo &&
            (Platform.OS === "web" ? (
              <View style={styles.videoWrap}>
                <video
                  src={fileUrl}
                  controls
                  autoPlay
                  style={{
                    maxWidth: "100%",
                    maxHeight: "85vh",
                    width: "auto",
                    height: "auto",
                    backgroundColor: "#000",
                  }}
                />
              </View>
            ) : (
              <View style={styles.videoWrap}>
                <Video
                  source={{ uri: fileUrl }}
                  style={styles.viewerVideo}
                  useNativeControls
                  resizeMode={ResizeMode.CONTAIN}
                  shouldPlay
                />
              </View>
            ))}

          {isText && (
            <View style={styles.textEditorWrap}>
              <TextInput
                style={styles.viewerTextInput}
                multiline
                value={viewerTextContent}
                onChangeText={setViewerTextContent}
                placeholder="Start typing..."
                placeholderTextColor={colors.subtext}
                autoCorrect={false}
                autoCapitalize="none"
                blurOnSubmit={false}
              />
            </View>
          )}
          {!isImage && !isVideo && !isText && (
            <View style={styles.viewerFallback}>
              {isPdf && Platform.OS === "web" ? (
                <View style={{ width: "100%", height: "100%" }}>
                  <iframe
                    src={fileUrl}
                    style={{
                      width: "100%",
                      height: "100%",
                      border: "none",
                      backgroundColor: "#fff",
                      borderRadius: 12,
                    }}
                    title="PDF Viewer"
                  />
                </View>
              ) : (
                <View style={styles.fallbackInner}>
                  <Text style={{ fontSize: 76, marginBottom: 14 }}>
                    {getFileIcon(item.fileType)}
                  </Text>
                  <Text style={styles.fallbackText}>
                    {isPdf
                      ? "PDF preview is not supported on mobile."
                      : "Preview not supported yet."}
                  </Text>
                  <TouchableOpacity
                    style={styles.downloadBtn}
                    onPress={() => onDownload(item)}
                  >
                    <Text style={styles.downloadBtnText}>
                      ⬇️ Download to View
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors, isDark) =>
  StyleSheet.create({
    viewerContainer: { flex: 1, backgroundColor: colors.bg },
    nativeGlassHeader: {
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      overflow: "hidden",
    },
    webGlassHeader: {
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: isDark
        ? "rgba(28,28,30,0.78)"
        : "rgba(255,255,255,0.86)",
      backdropFilter: "blur(16px)",
    } as any,
    viewerHeader: {
      paddingTop: 52,
      paddingBottom: 12,
      paddingHorizontal: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      minHeight: 88,
    },
    headerBtn: { paddingVertical: 6, paddingHorizontal: 8, borderRadius: 12 },
    viewerCloseText: { color: colors.tint, fontSize: 17, fontWeight: "600" },
    viewerSaveText: { color: colors.success, fontSize: 17, fontWeight: "700" },
    viewerTitle: {
      color: colors.text,
      fontSize: 15,
      fontWeight: "700",
      maxWidth: "44%",
      textAlign: "center",
    },
    rightActions: { flexDirection: "row", alignItems: "center" },
    iconBtn: {
      marginRight: 8,
      width: 34,
      height: 34,
      borderRadius: 17,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: colors.card2,
      borderWidth: 1,
      borderColor: colors.border,
    },
    viewerActionIcon: { fontSize: 20, color: colors.tint },
    viewerBody: {
      flex: 1,
      width: "100%",
      alignItems: "center",
      justifyContent: "center",
    },
    viewerImage: { width: "100%", height: "100%" },
    viewerVideo: { width: "100%", height: "100%" },
    textEditorWrap: {
      width: "96%",
      height: "96%",
      borderRadius: 14,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    viewerTextInput: {
      flex: 1,
      width: "100%",
      color: colors.text,
      padding: 16,
      fontSize: 16,
      textAlignVertical: "top",
    },
    viewerFallback: {
      flex: 1,
      width: "100%",
      padding: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    fallbackInner: { alignItems: "center", justifyContent: "center", flex: 1 },
    fallbackText: {
      color: colors.text,
      fontSize: 16,
      marginBottom: 18,
      textAlign: "center",
    },
    downloadBtn: {
      backgroundColor: colors.tint,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 12,
    },
    downloadBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
    globalToast: {
      position: "absolute",
      top: 44,
      alignSelf: "center",
      backgroundColor: colors.card2,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 16,
      paddingVertical: 9,
      borderRadius: 16,
      zIndex: 999,
    },
    globalToastText: { color: colors.text, fontSize: 13, fontWeight: "600" },
    videoWrap: {
      width: "100%",
      height: "100%",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#000",
    },
  });
