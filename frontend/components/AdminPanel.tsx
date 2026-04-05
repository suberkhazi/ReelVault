import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  ScrollView,
  useWindowDimensions,
  Image,
} from "react-native";
import { useAppTheme } from "../theme/useAppTheme";
import { adminApi } from "../services/adminApi";

const BASE_URL = "http://100.106.246.108:4000";

export default function AdminPanel({ onClose }) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const { width } = useWindowDimensions();

  const [activeTab, setActiveTab] = useState<
    "users" | "files" | "stats" | "shares"
  >("users");
  const [users, setUsers] = useState<any[]>([]);
  const [allFiles, setAllFiles] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [shares, setShares] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [userFiles, setUserFiles] = useState<any[]>([]);
  const [viewingFile, setViewingFile] = useState<any>(null);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await adminApi.getAllUsers();
      setUsers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.log("Error loading users:", error);
      Alert.alert("Error", "Failed to load users");
    }
    setLoading(false);
  };

  const loadFiles = async () => {
    setLoading(true);
    try {
      const data = await adminApi.getAllFiles();
      setAllFiles(Array.isArray(data) ? data : []);
    } catch (error) {
      console.log("Error loading files:", error);
      Alert.alert("Error", "Failed to load files");
    }
    setLoading(false);
  };

  const loadStats = async () => {
    setLoading(true);
    try {
      const data = await adminApi.getStats();
      setStats(data);
    } catch (error) {
      console.log("Error loading stats:", error);
      Alert.alert("Error", "Failed to load stats");
    }
    setLoading(false);
  };

  const loadShares = async () => {
    setLoading(true);
    try {
      const data = await adminApi.getAllShares();
      setShares(Array.isArray(data) ? data : []);
    } catch (error) {
      console.log("Error loading shares:", error);
      Alert.alert("Error", "Failed to load shares");
    }
    setLoading(false);
  };

  const loadUserFiles = async (userId: string) => {
    try {
      const data = await adminApi.getUserFiles(userId);
      setUserFiles(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error loading user files:", error);
      Alert.alert("Error", error.message || "Failed to load user files");
    }
  };

  useEffect(() => {
    if (activeTab === "users") loadUsers();
    else if (activeTab === "files") loadFiles();
    else if (activeTab === "stats") loadStats();
    else if (activeTab === "shares") loadShares();
  }, [activeTab]);

  const handleDeleteUser = (userId, username) => {
    if (window.confirm(`Delete user ${username} and ALL their files?`)) {
      deleteUserNow(userId, username);
    }
  };

  const deleteUserNow = async (userId, username) => {
    try {
      await adminApi.deleteUser(userId);
      setUsers(users.filter((u) => u.id !== userId));
      Alert.alert("Success", "User deleted.");
      loadStats();
    } catch (error) {
      Alert.alert("Error", error.message || "Failed to delete user.");
    }
  };

  const handleDeleteFile = (fileId, filename) => {
    if (window.confirm(`Delete ${filename}?`)) {
      deleteFileNow(fileId, filename);
    }
  };

  const deleteFileNow = async (fileId, filename) => {
    try {
      await adminApi.deleteFile(fileId, filename);
      setAllFiles(allFiles.filter((f) => f.id !== fileId));
      if (selectedUser) {
        await loadUserFiles(selectedUser.id);
      }
      Alert.alert("Success", "File deleted.");
      await loadStats();
    } catch (error) {
      console.error("Delete error:", error);
      Alert.alert("Error", error.message || "Failed to delete file.");
    }
  };

  const handleRevokeShare = (shareId) => {
    if (window.confirm("Remove this share link?")) {
      revokeShareNow(shareId);
    }
  };

  const revokeShareNow = async (shareId) => {
    try {
      await adminApi.revokeShare(shareId);
      setShares(shares.filter((s) => s.id !== shareId));
      Alert.alert("Success", "Share revoked.");
      loadStats();
    } catch (error) {
      Alert.alert("Error", "Failed to revoke share.");
    }
  };

  const openFile = (file) => {
    setViewingFile(file);
  };

  const FileViewer = ({ file, onClose }) => {
    if (!file) return null;

    const isImage = file.fileType?.startsWith("image/");
    const isVideo = file.fileType?.startsWith("video/");
    const isPdf = file.fileType?.includes("pdf");
    const fileUrl = `${BASE_URL}/uploads/${encodeURIComponent(file.filename)}`;

    return (
      <View style={styles.fileViewerOverlay}>
        <View style={styles.fileViewerContainer}>
          <View style={styles.fileViewerHeader}>
            <Text style={styles.fileViewerTitle} numberOfLines={1}>
              {file.filename}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.fileViewerClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.fileViewerContent}>
            {isImage ? (
              <Image
                source={{ uri: fileUrl }}
                style={styles.fileViewerImage}
                resizeMode="contain"
              />
            ) : isVideo ? (
              <View style={styles.videoContainer}>
                <Text style={styles.videoPlaceholder}>🎬</Text>
                <Text style={styles.videoTitle}>Video File</Text>
                <TouchableOpacity
                  onPress={() => window.open(fileUrl, "_blank")}
                  style={styles.openVideoBtn}
                >
                  <Text style={styles.openVideoBtnText}>Open in New Tab</Text>
                </TouchableOpacity>
              </View>
            ) : isPdf ? (
              <View style={styles.pdfContainer}>
                <Text style={styles.pdfPlaceholder}>📕</Text>
                <Text style={styles.pdfTitle}>PDF File</Text>
                <TouchableOpacity
                  onPress={() => window.open(fileUrl, "_blank")}
                  style={styles.openPdfBtn}
                >
                  <Text style={styles.openPdfBtnText}>Open PDF</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.filePreviewContainer}>
                <Text style={styles.filePreviewIcon}>📄</Text>
                <Text style={styles.filePreviewText}>
                  {file.fileType || "File"}
                </Text>
                <TouchableOpacity
                  onPress={() => window.open(fileUrl, "_blank")}
                  style={styles.downloadBtn}
                >
                  <Text style={styles.downloadBtnText}>⬇️ Download File</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.fileDetailsSection}>
              <Text style={styles.detailsTitle}>File Details</Text>
              <Text style={styles.detailsText}>Name: {file.filename}</Text>
              <Text style={styles.detailsText}>
                Type: {file.fileType || "Unknown"}
              </Text>
              <Text style={styles.detailsText}>
                Size:{" "}
                {file.fileSize
                  ? (file.fileSize / 1024 / 1024).toFixed(2) + " MB"
                  : "N/A"}
              </Text>
              <Text style={styles.detailsText}>
                Uploaded: {new Date(file.createdAt).toLocaleString()}
              </Text>
            </View>
          </ScrollView>
        </View>
      </View>
    );
  };

  const filteredUsers = users.filter((u) =>
    u.username.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const filteredFiles = allFiles.filter((f) =>
    f.filename.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const filteredUserFiles = userFiles.filter((f) =>
    f.filename.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>⚙️ Admin Panel</Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.closeBtn}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <TextInput
        style={styles.searchBar}
        placeholder="Search..."
        placeholderTextColor={colors.subtext}
        value={searchQuery}
        onChangeText={setSearchQuery}
      />

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        {(["users", "files", "stats", "shares"] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.activeTab]}
            onPress={() => {
              setActiveTab(tab);
              setSelectedUser(null);
              setSearchQuery("");
            }}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab && styles.activeTabText,
              ]}
            >
              {tab === "users"
                ? "👥 Users"
                : tab === "files"
                  ? "📁 Files"
                  : tab === "stats"
                    ? "📊 Stats"
                    : "🔗 Shares"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <Text style={styles.loadingText}>Loading...</Text>
        ) : activeTab === "users" && !selectedUser ? (
          <View>
            <Text style={styles.sectionTitle}>
              👥 Total Users: {users.length}
            </Text>
            {filteredUsers.length === 0 ? (
              <Text style={styles.emptyText}>No users found</Text>
            ) : (
              <FlatList
                scrollEnabled={false}
                data={filteredUsers}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <View style={styles.card}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardTitle}>{item.username}</Text>
                      <Text style={styles.cardSubtitle}>{item.id}</Text>
                    </View>
                    <Text style={styles.cardText}>
                      📅 Created:{" "}
                      {new Date(item.createdAt).toLocaleDateString()}
                    </Text>
                    <View style={styles.cardActions}>
                      <TouchableOpacity
                        style={[styles.actionBtn, { flex: 1, marginRight: 8 }]}
                        onPress={() => {
                          setSelectedUser(item);
                          loadUserFiles(item.id);
                        }}
                      >
                        <Text style={styles.actionBtnText}>👁️ View Files</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.deleteBtn, { flex: 1 }]}
                        onPress={() => handleDeleteUser(item.id, item.username)}
                      >
                        <Text style={styles.deleteBtnText}>🗑️ Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              />
            )}
          </View>
        ) : activeTab === "users" && selectedUser ? (
          <View>
            <View style={styles.backHeader}>
              <TouchableOpacity onPress={() => setSelectedUser(null)}>
                <Text style={styles.backBtn}>‹ Back to Users</Text>
              </TouchableOpacity>
              <Text style={styles.sectionTitle}>
                📂 {selectedUser.username}'s Files ({userFiles.length})
              </Text>
            </View>
            {filteredUserFiles.length === 0 ? (
              <Text style={styles.emptyText}>No files found</Text>
            ) : (
              <FlatList
                scrollEnabled={false}
                data={filteredUserFiles}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.card}
                    onPress={() => openFile(item)}
                  >
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardTitle} numberOfLines={2}>
                        {item.filename}
                      </Text>
                      <Text style={styles.cardSubtitle}>{item.fileType}</Text>
                    </View>
                    <Text style={styles.cardText}>
                      💾 Size:{" "}
                      {item.fileSize
                        ? (item.fileSize / 1024 / 1024).toFixed(2) + " MB"
                        : "N/A"}
                    </Text>
                    <Text style={styles.cardText}>
                      📅 Uploaded:{" "}
                      {new Date(item.createdAt).toLocaleDateString()}
                    </Text>
                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={() => handleDeleteFile(item.id, item.filename)}
                    >
                      <Text style={styles.deleteBtnText}>🗑️ Delete File</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        ) : activeTab === "files" ? (
          <View>
            <View style={styles.fileHeaderSection}>
              <Text style={styles.sectionTitle}>
                📁 All Files ({allFiles.length})
              </Text>
              {searchQuery && (
                <Text style={styles.searchResultsText}>
                  Showing {filteredFiles.length} results
                </Text>
              )}
            </View>
            {filteredFiles.length === 0 ? (
              <Text style={styles.emptyText}>No files found</Text>
            ) : (
              <FlatList
                scrollEnabled={false}
                data={filteredFiles}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.card}
                    onPress={() => openFile(item)}
                  >
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardTitle} numberOfLines={2}>
                        {item.filename}
                      </Text>
                      <Text style={styles.cardSubtitle}>{item.fileType}</Text>
                    </View>
                    <Text style={styles.cardText}>
                      📤 Uploader: {item.uploaderUsername || "Unknown"}
                    </Text>
                    <Text style={styles.cardText}>
                      💾 Size:{" "}
                      {item.fileSize
                        ? (item.fileSize / 1024 / 1024).toFixed(2) + " MB"
                        : "N/A"}
                    </Text>
                    <Text style={styles.cardText}>
                      📅 Uploaded:{" "}
                      {new Date(item.createdAt).toLocaleDateString()}
                    </Text>
                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={() => handleDeleteFile(item.id, item.filename)}
                    >
                      <Text style={styles.deleteBtnText}>🗑️ Delete File</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        ) : activeTab === "stats" ? (
          <View>
            {stats && (
              <View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>👥 Total Users</Text>
                  <Text style={styles.statValue}>{stats.totalUsers || 0}</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>📁 Total Files</Text>
                  <Text style={styles.statValue}>{stats.totalFiles || 0}</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>📂 Total Folders</Text>
                  <Text style={styles.statValue}>
                    {stats.totalFolders || 0}
                  </Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>💾 Total Size</Text>
                  <Text style={styles.statValue}>
                    {stats.totalSize
                      ? (stats.totalSize / 1024 / 1024 / 1024).toFixed(2) +
                        " GB"
                      : "0 GB"}
                  </Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>🔗 Active Shares</Text>
                  <Text style={styles.statValue}>
                    {stats.activeShares || 0}
                  </Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>📊 Avg Files Per User</Text>
                  <Text style={styles.statValue}>
                    {stats.totalUsers
                      ? (stats.totalFiles / stats.totalUsers).toFixed(1)
                      : "0"}
                  </Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>💿 Avg Size Per File</Text>
                  <Text style={styles.statValue}>
                    {stats.totalFiles
                      ? (
                          stats.totalSize /
                          stats.totalFiles /
                          1024 /
                          1024
                        ).toFixed(2) + " MB"
                      : "0 MB"}
                  </Text>
                </View>
              </View>
            )}
          </View>
        ) : (
          <View>
            <Text style={styles.sectionTitle}>
              🔗 Total Shares: {shares.length}
            </Text>
            {shares.length === 0 ? (
              <Text style={styles.emptyText}>No shares found</Text>
            ) : (
              <FlatList
                scrollEnabled={false}
                data={shares}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <View style={styles.card}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardTitle}>{item.itemType}</Text>
                      <Text style={styles.cardSubtitle}>
                        {item.token || item.sharedWith || "Public"}
                      </Text>
                    </View>
                    <Text style={styles.cardText}>
                      Shared By: {item.sharedBy}
                    </Text>
                    <Text style={styles.cardText}>
                      📅 Created:{" "}
                      {new Date(item.createdAt).toLocaleDateString()}
                    </Text>
                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={() => handleRevokeShare(item.id)}
                    >
                      <Text style={styles.deleteBtnText}>🔓 Revoke Share</Text>
                    </TouchableOpacity>
                  </View>
                )}
              />
            )}
          </View>
        )}
      </ScrollView>

      {viewingFile && (
        <FileViewer file={viewingFile} onClose={() => setViewingFile(null)} />
      )}
    </View>
  );
}

const makeStyles = (colors, isDark) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
      width: "100%",
      height: "100vh",
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: 16,
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    title: {
      fontSize: 20,
      fontWeight: "700",
      color: colors.text,
    },
    closeBtn: {
      fontSize: 24,
      color: colors.danger,
      fontWeight: "700",
    },
    searchBar: {
      margin: 14,
      padding: 10,
      backgroundColor: colors.input,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.text,
    },
    tabsContainer: {
      flexDirection: "row",
      paddingHorizontal: 14,
      gap: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.card,
    },
    tab: {
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderBottomWidth: 2,
      borderBottomColor: "transparent",
    },
    activeTab: {
      borderBottomColor: colors.tint,
    },
    tabText: {
      color: colors.subtext,
      fontWeight: "600",
    },
    activeTabText: {
      color: colors.tint,
    },
    content: {
      flex: 1,
      padding: 14,
    },
    loadingText: {
      color: colors.subtext,
      textAlign: "center",
      marginTop: 20,
    },
    emptyText: {
      color: colors.subtext,
      textAlign: "center",
      marginTop: 20,
      fontSize: 14,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.text,
      marginBottom: 12,
    },
    fileHeaderSection: {
      marginBottom: 12,
    },
    searchResultsText: {
      color: colors.subtext,
      fontSize: 12,
      marginTop: 4,
    },
    backHeader: {
      marginBottom: 16,
    },
    backBtn: {
      color: colors.tint,
      fontWeight: "700",
      fontSize: 14,
      marginBottom: 8,
    },
    card: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      padding: 12,
      marginBottom: 10,
    },
    cardHeader: {
      marginBottom: 8,
    },
    cardTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.text,
    },
    cardSubtitle: {
      fontSize: 12,
      color: colors.subtext,
      marginTop: 2,
    },
    cardText: {
      fontSize: 12,
      color: colors.subtext,
      marginBottom: 4,
    },
    cardActions: {
      flexDirection: "row",
      marginTop: 8,
    },
    actionBtn: {
      backgroundColor: colors.tint,
      padding: 8,
      borderRadius: 8,
      alignItems: "center",
    },
    actionBtnText: {
      color: "#fff",
      fontWeight: "700",
      fontSize: 12,
    },
    deleteBtn: {
      marginTop: 8,
      backgroundColor: colors.danger,
      padding: 8,
      borderRadius: 8,
      alignItems: "center",
    },
    deleteBtnText: {
      color: "#fff",
      fontWeight: "700",
      fontSize: 12,
    },
    statCard: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      alignItems: "center",
    },
    statLabel: {
      fontSize: 14,
      color: colors.subtext,
      marginBottom: 8,
    },
    statValue: {
      fontSize: 28,
      fontWeight: "700",
      color: colors.tint,
    },
    fileViewerOverlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0, 0, 0, 0.8)",
      zIndex: 1000,
      justifyContent: "center",
      alignItems: "center",
    },
    fileViewerContainer: {
      width: "90%",
      maxWidth: 900,
      maxHeight: "90%",
      backgroundColor: colors.bg,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    fileViewerHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: 16,
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    fileViewerTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.text,
      flex: 1,
    },
    fileViewerClose: {
      fontSize: 24,
      color: colors.danger,
      fontWeight: "700",
      marginLeft: 16,
    },
    fileViewerContent: {
      flex: 1,
      padding: 16,
    },
    fileViewerImage: {
      width: "100%",
      height: 400,
      borderRadius: 12,
      marginBottom: 16,
    },
    videoContainer: {
      alignItems: "center",
      justifyContent: "center",
      padding: 32,
      backgroundColor: colors.card,
      borderRadius: 12,
      marginBottom: 16,
    },
    videoPlaceholder: {
      fontSize: 48,
      marginBottom: 8,
    },
    videoTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.text,
      marginBottom: 16,
    },
    openVideoBtn: {
      backgroundColor: colors.tint,
      padding: 12,
      borderRadius: 8,
    },
    openVideoBtnText: {
      color: "#fff",
      fontWeight: "700",
    },
    pdfContainer: {
      alignItems: "center",
      justifyContent: "center",
      padding: 32,
      backgroundColor: colors.card,
      borderRadius: 12,
      marginBottom: 16,
    },
    pdfPlaceholder: {
      fontSize: 48,
      marginBottom: 8,
    },
    pdfTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.text,
      marginBottom: 16,
    },
    openPdfBtn: {
      backgroundColor: colors.tint,
      padding: 12,
      borderRadius: 8,
    },
    openPdfBtnText: {
      color: "#fff",
      fontWeight: "700",
    },
    filePreviewContainer: {
      alignItems: "center",
      justifyContent: "center",
      padding: 32,
      backgroundColor: colors.card,
      borderRadius: 12,
      marginBottom: 16,
    },
    filePreviewIcon: {
      fontSize: 64,
      marginBottom: 16,
    },
    filePreviewText: {
      fontSize: 14,
      color: colors.subtext,
      marginBottom: 16,
    },
    downloadBtn: {
      backgroundColor: colors.tint,
      padding: 12,
      borderRadius: 8,
    },
    downloadBtnText: {
      color: "#fff",
      fontWeight: "700",
    },
    fileDetailsSection: {
      backgroundColor: colors.card,
      padding: 16,
      borderRadius: 12,
      marginTop: 16,
    },
    detailsTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.text,
      marginBottom: 12,
    },
    detailsText: {
      fontSize: 12,
      color: colors.subtext,
      marginBottom: 8,
    },
  });
