"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface FaceMatch {
  x: number;
  y: number;
  width: number;
  height: number;
  match_filename: string | null;
  match_score: number;
}

interface Room {
  id: string;
  name: string;
  members: string[];
}

const API_BASE = "https://tiger-dorm-security-backend.fly.dev";

// Permanent rooms that cannot be deleted
const PERMANENT_ROOM_IDS = new Set([
  "princeton",
  "butler",
  "forbes",
  "mathey",
  "ncw",
  "rocky",
  "whitman",
  "yeh",
]);

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [faces, setFaces] = useState<FaceMatch[]>([]);
  const shouldContinueRef = useRef(false);
  const [showCreateRoomPanel, setShowCreateRoomPanel] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [showEditMembers, setShowEditMembers] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const [memberSearchResults, setMemberSearchResults] = useState<string[]>([]);
  const [isLoadingRooms, setIsLoadingRooms] = useState(true);
  const [securityThreat, setSecurityThreat] = useState(false);
  const [defaultRoomsOpen, setDefaultRoomsOpen] = useState(true);
  const [customRoomsOpen, setCustomRoomsOpen] = useState(true);

  const drawBoundingBoxes = useCallback(() => {
    if (!overlayCanvasRef.current || !videoRef.current) return;

    const canvas = overlayCanvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Get the displayed size of the video element
    const displayWidth = video.clientWidth;
    const displayHeight = video.clientHeight;

    // Set canvas to match displayed video size
    canvas.width = displayWidth;
    canvas.height = displayHeight;

    // Calculate scale factors from native video resolution to displayed size
    const scaleX = displayWidth / video.videoWidth;
    const scaleY = displayHeight / video.videoHeight;

    // Clear previous drawings
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw bounding boxes with labels
    ctx.lineWidth = 3;
    ctx.font = "16px sans-serif";

    faces.forEach((face) => {
      // Check if person is authorized (in the active room's member list)
      // Unknown faces are NOT authorized
      const isAuthorized = !activeRoom ||
                          (face.match_filename &&
                           face.match_filename !== "Unknown" &&
                           activeRoom.members.includes(face.match_filename));

      // Set color based on authorization status
      const boxColor = isAuthorized ? "#22c55e" : "#dc2626"; // green for authorized, red for unauthorized
      ctx.strokeStyle = boxColor;

      // Scale bounding box coordinates to match displayed video size
      const scaledX = face.x * scaleX;
      const scaledY = face.y * scaleY;
      const scaledWidth = face.width * scaleX;
      const scaledHeight = face.height * scaleY;

      // Draw bounding box
      ctx.strokeRect(scaledX, scaledY, scaledWidth, scaledHeight);

      // Draw label background
      if (face.match_filename) {
        const label = face.match_filename;
        const labelWidth = ctx.measureText(label).width + 10;
        const labelHeight = 22;

        ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
        ctx.fillRect(scaledX, scaledY - labelHeight, labelWidth, labelHeight);

        // Draw label text
        ctx.fillStyle = boxColor;
        ctx.fillText(label, scaledX + 5, scaledY - 6);
      }
    });
  }, [faces, activeRoom]);

  useEffect(() => {
    drawBoundingBoxes();
  }, [faces, drawBoundingBoxes]);

  // Check for security threats (unauthorized people)
  useEffect(() => {
    if (!activeRoom || faces.length === 0) {
      setSecurityThreat(false);
      return;
    }

    // Check if at least one person is authorized
    // Unknown faces are NOT authorized
    const hasAuthorizedPerson = faces.some((face) => {
      if (!face.match_filename || face.match_filename === "Unknown") return false;
      return activeRoom.members.includes(face.match_filename);
    });

    // Only show security threat if NO authorized people detected
    setSecurityThreat(!hasAuthorizedPerson);
  }, [faces, activeRoom]);

  // Custom rooms stored in state (lost on page refresh)
  const [customRooms, setCustomRooms] = useState<Room[]>([]);
  const [defaultRooms, setDefaultRooms] = useState<Room[]>([]);

  // Load default rooms from JSON file (only once on mount)
  useEffect(() => {
    const loadDefaultRooms = async () => {
      try {
        const response = await fetch("/default_rooms.json");
        const data = await response.json();
        
        // Convert to Room format
        const defaultRoomList: Room[] = Object.entries(data).map(([id, members]) => {
          // Format display name
          let displayName = id;
          if (id === "princeton") {
            displayName = "Princeton Undergrad";
          } else {
            displayName = id.charAt(0).toUpperCase() + id.slice(1); // Capitalize first letter
          }

          return {
            id,
            name: displayName,
            members: members as string[],
          };
        });

        setDefaultRooms(defaultRoomList);
      } catch (err) {
        console.error("Failed to load default rooms:", err);
      } finally {
        setIsLoadingRooms(false);
      }
    };

    loadDefaultRooms();
  }, []);

  // Combine default and custom rooms whenever either changes
  useEffect(() => {
    const allRooms = [...defaultRooms, ...customRooms];
    allRooms.sort((a, b) => {
      const aIsPermanent = PERMANENT_ROOM_IDS.has(a.id);
      const bIsPermanent = PERMANENT_ROOM_IDS.has(b.id);
      // Princeton always comes first
      if (a.id === "princeton") return -1;
      if (b.id === "princeton") return 1;
      // Then other permanent rooms (residential colleges)
      if (aIsPermanent && !bIsPermanent) return -1;
      if (!aIsPermanent && bIsPermanent) return 1;
      // Then alphabetically
      return a.name.localeCompare(b.name);
    });
    
    setRooms(allRooms);
  }, [defaultRooms, customRooms]);

  // Update activeRoom if it was deleted
  useEffect(() => {
    if (activeRoom && !rooms.some(r => r.id === activeRoom.id)) {
      setActiveRoom(null);
    } else if (activeRoom) {
      // Update activeRoom with latest data
      const updatedRoom = rooms.find(r => r.id === activeRoom.id);
      if (updatedRoom) {
        setActiveRoom(updatedRoom);
      }
    }
  }, [rooms, activeRoom]);

  // Update selectedRoom if it was deleted or modified
  useEffect(() => {
    if (selectedRoom) {
      const updatedRoom = rooms.find(r => r.id === selectedRoom.id);
      if (updatedRoom) {
        // Only update if members changed to avoid unnecessary re-renders
        if (JSON.stringify(updatedRoom.members) !== JSON.stringify(selectedRoom.members)) {
          setSelectedRoom(updatedRoom);
        }
      } else {
        setSelectedRoom(null);
        setShowEditMembers(false);
      }
    }
  }, [rooms, selectedRoom]);

  // Search people from backend
  const searchPeople = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    try {
      const response = await fetch(
        `${API_BASE}/api/people?q=${encodeURIComponent(query)}`
      );
      const data = await response.json();
      setSearchResults(data.people || []);
    } catch (err) {
      console.error("Failed to search people:", err);
    }
  }, []);

  // Search members from backend
  const searchMembers = useCallback(async (query: string) => {
    if (!query.trim()) {
      setMemberSearchResults([]);
      return;
    }
    try {
      const response = await fetch(
        `${API_BASE}/api/people?q=${encodeURIComponent(query)}`
      );
      const data = await response.json();
      setMemberSearchResults(data.people || []);
    } catch (err) {
      console.error("Failed to search people:", err);
    }
  }, []);

  // Debounced search effects
  useEffect(() => {
    const timer = setTimeout(() => searchPeople(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery, searchPeople]);

  useEffect(() => {
    const timer = setTimeout(() => searchMembers(memberSearchQuery), 300);
    return () => clearTimeout(timer);
  }, [memberSearchQuery, searchMembers]);

  // Create room (local state only)
  const createRoom = (name: string, members: string[] = []) => {
    const roomId = name.toLowerCase().replace(/\s+/g, "_");
    
    // Check if room already exists
    if (rooms.some(r => r.id === roomId)) {
      alert(`Room "${name}" already exists`);
      return;
    }

    const newRoom: Room = {
      id: roomId,
      name: name,
      members: members,
    };

    setCustomRooms(prev => [...prev, newRoom]);
  };

  // Delete room (local state only - only custom rooms can be deleted)
  const deleteRoom = (roomId: string) => {
    if (PERMANENT_ROOM_IDS.has(roomId)) {
      alert("Cannot delete default rooms");
      return;
    }

    setCustomRooms(prev => prev.filter(r => r.id !== roomId));
    
    if (selectedRoom?.id === roomId) {
      setSelectedRoom(null);
      setShowEditMembers(false);
    }
  };

  // Add member to room (local state only)
  const addMemberToRoom = (roomId: string, member: string) => {
    if (PERMANENT_ROOM_IDS.has(roomId)) {
      alert("Cannot modify default rooms");
      return;
    }

    setCustomRooms(prev => prev.map(room => {
      if (room.id === roomId) {
        const updatedMembers = room.members.includes(member) 
          ? room.members 
          : [...room.members, member];
        return { ...room, members: updatedMembers };
      }
      return room;
    }));

    // Update selected room if it's the one being edited
    if (selectedRoom?.id === roomId) {
      setSelectedRoom(prev => {
        if (!prev) return null;
        const updatedMembers = prev.members.includes(member)
          ? prev.members
          : [...prev.members, member];
        return { ...prev, members: updatedMembers };
      });
    }
  };

  // Remove member from room (local state only)
  const removeMemberFromRoom = (roomId: string, member: string) => {
    if (PERMANENT_ROOM_IDS.has(roomId)) {
      alert("Cannot modify default rooms");
      return;
    }

    setCustomRooms(prev => prev.map(room => {
      if (room.id === roomId) {
        return { ...room, members: room.members.filter(m => m !== member) };
      }
      return room;
    }));

    // Update selected room if it's the one being edited
    if (selectedRoom?.id === roomId) {
      setSelectedRoom(prev => {
        if (!prev) return null;
        return { ...prev, members: prev.members.filter(m => m !== member) };
      });
    }
  };

  const captureAndSendFrame = useCallback(async (): Promise<boolean> => {
    if (!videoRef.current || !canvasRef.current) return false;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;

    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0);

    // Convert to base64
    const imageData = canvas.toDataURL("image/jpeg", 0.8);

    try {
      const response = await fetch(`${API_BASE}/api/process-frame`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ image: imageData }),
      });

      const result = await response.json();
      setFaces(result.faces || []);
      return true;
    } catch (err) {
      setError("Failed to send frame");
      return false;
    }
  }, []);

  const runContinuousCapture = useCallback(async () => {
    while (shouldContinueRef.current) {
      await captureAndSendFrame();
      // Delay of 500ms (half a second) between frame requests
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }, [captureAndSendFrame]);

  const startWebcam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsStreaming(true);
        setError(null);
      }
    } catch (err) {
      setError("Failed to access webcam. Please allow camera permissions.");
    }
  };

  const stopWebcam = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
      setIsStreaming(false);
    }
    stopSending();
    setFaces([]);
    setActiveRoom(null);
    setSecurityThreat(false);
  };

  const startSending = () => {
    shouldContinueRef.current = true;
    setIsSending(true);
    runContinuousCapture();
  };

  const stopSending = () => {
    shouldContinueRef.current = false;
    setIsSending(false);
    setFaces([]);
  };

  useEffect(() => {
    return () => {
      shouldContinueRef.current = false;
      stopWebcam();
    };
  }, []);

  return (
    <div className="flex min-h-screen bg-gradient-to-b from-zinc-900 to-black text-white">
      <main className="flex-1 flex flex-col items-center gap-4 p-8 overflow-y-auto">
        <h1 className="text-4xl font-bold">Tiger Dorm Security</h1>

        <div className="flex flex-col items-center gap-4 rounded-lg bg-zinc-800 p-6 w-full max-w-5xl">
          {/* Room Selector */}
          {!isStreaming && (
            <div className="w-full mb-4">
              <label className="block text-sm font-medium mb-2">
                Select Room for Monitoring
              </label>
              <select
                value={activeRoom?.id || ""}
                onChange={(e) => {
                  const room = rooms.find((r) => r.id === e.target.value);
                  setActiveRoom(room || null);
                }}
                className="w-full px-4 py-2 rounded-lg bg-zinc-700 border border-zinc-600 focus:border-orange-500 focus:outline-none"
              >
                <option value="">-- Select a room --</option>
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Active Room Display */}
          {isStreaming && activeRoom && (
            <div className="w-full mb-2 px-4 py-2 bg-zinc-700 rounded-lg">
              <span className="text-sm font-medium">Monitoring Room: </span>
              <span className="text-orange-400 font-semibold">{activeRoom.name}</span>
            </div>
          )}

          <div ref={containerRef} className="relative w-full">
            {/* Security Status Overlay */}
            {isSending && faces.length > 0 && (
              <div className="absolute top-0 left-0 w-full h-full pointer-events-none flex items-start justify-center pt-8 z-10">
                {securityThreat ? (
                  <div className="absolute top-0 left-0 w-full h-full bg-red-600/30 rounded-lg flex items-start justify-center pt-8">
                    <div className="bg-red-600 px-6 py-3 rounded-lg shadow-lg animate-pulse">
                      <span className="text-white text-2xl font-bold">⚠️ SECURITY THREAT</span>
                    </div>
                  </div>
                ) : (
                  <div className="bg-green-600 px-6 py-3 rounded-lg shadow-lg">
                    <span className="text-white text-2xl font-bold">✓ ACCESS GRANTED</span>
                  </div>
                )}
              </div>
            )}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full rounded-lg bg-black"
              style={{ display: "block" }}
            />
            <canvas
              ref={overlayCanvasRef}
              className="absolute top-0 left-0 w-full h-full pointer-events-none rounded-lg"
            />
          </div>
          <canvas ref={canvasRef} className="hidden" />

          {error && <p className="text-red-400">{error}</p>}

          {isSending && faces.length > 0 && (
            <div className="flex flex-wrap gap-2 justify-center">
              {faces.map((face, index) => (
                <div
                  key={index}
                  className="bg-zinc-700 rounded px-3 py-1 text-sm"
                >
                  {face.match_filename || "No match"}{" "}
                  <span className="text-zinc-400">
                    ({(face.match_score * 100).toFixed(1)}%)
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col items-center gap-4">
            {!isStreaming && !activeRoom && (
              <p className="text-yellow-400 text-sm">
                Please select a room before starting the webcam
              </p>
            )}
            <div className="flex gap-4">
              {!isStreaming ? (
                <button
                  onClick={startWebcam}
                  disabled={!activeRoom}
                  className={`rounded-lg px-6 py-2 font-medium transition-colors ${
                    activeRoom
                      ? "bg-green-600 hover:bg-green-700"
                      : "bg-gray-600 cursor-not-allowed opacity-50"
                  }`}
                >
                  Start Webcam
                </button>
              ) : (
              <>
                <button
                  onClick={stopWebcam}
                  className="rounded-lg bg-red-600 px-6 py-2 font-medium hover:bg-red-700 transition-colors"
                >
                  Stop Webcam
                </button>
                {!isSending ? (
                  <button
                    onClick={startSending}
                    className="rounded-lg bg-blue-600 px-6 py-2 font-medium hover:bg-blue-700 transition-colors"
                  >
                    Start Monitoring
                  </button>
                ) : (
                  <button
                    onClick={stopSending}
                    className="rounded-lg bg-yellow-600 px-6 py-2 font-medium hover:bg-yellow-700 transition-colors"
                  >
                    Stop Monitoring
                  </button>
                )}
              </>
            )}
            </div>
          </div>
        </div>

        {showCreateRoomPanel && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-zinc-800 rounded-lg p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold">Create Room</h2>
                <button
                  onClick={() => {
                    setShowCreateRoomPanel(false);
                    setRoomName("");
                    setSearchQuery("");
                    setSelectedMembers([]);
                  }}
                  className="text-gray-400 hover:text-white text-2xl"
                >
                  &times;
                </button>
              </div>

              <div className="flex flex-col gap-4">
                <div>
                  <label
                    htmlFor="roomName"
                    className="block text-sm font-medium mb-2"
                  >
                    Room Name
                  </label>
                  <input
                    id="roomName"
                    type="text"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder="Enter room name"
                    className="w-full px-4 py-2 rounded-lg bg-zinc-700 border border-zinc-600 focus:border-orange-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="searchPeople"
                    className="block text-sm font-medium mb-2"
                  >
                    Search People
                  </label>
                  <input
                    id="searchPeople"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search for people..."
                    className="w-full px-4 py-2 rounded-lg bg-zinc-700 border border-zinc-600 focus:border-orange-500 focus:outline-none"
                  />

                  {/* Filtered Names List */}
                  {searchQuery.trim() !== "" && (
                    <div className="mt-2 max-h-60 overflow-y-auto bg-zinc-700 rounded-lg border border-zinc-600">
                      {searchResults.length > 0 ? (
                        searchResults
                          .filter((name) => !selectedMembers.includes(name))
                          .map((name, index) => (
                            <div
                              key={index}
                              onClick={() => {
                                setSelectedMembers([...selectedMembers, name]);
                                setSearchQuery("");
                              }}
                              className="px-4 py-2 hover:bg-zinc-600 cursor-pointer transition-colors border-b border-zinc-600 last:border-b-0"
                            >
                              {name}
                            </div>
                          ))
                      ) : (
                        <div className="px-4 py-2 text-gray-400 text-sm">
                          No matches found
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Selected Members */}
                {selectedMembers.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium mb-2">
                      Selected Members ({selectedMembers.length})
                    </h3>
                    <div className="flex flex-col gap-2 max-h-40 overflow-y-auto">
                      {selectedMembers.map((member, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between bg-zinc-700 rounded-lg px-3 py-2"
                        >
                          <span>{member}</span>
                          <button
                            onClick={() =>
                              setSelectedMembers(
                                selectedMembers.filter((m) => m !== member)
                              )
                            }
                            className="text-red-400 hover:text-red-300 text-sm"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => {
                      setShowCreateRoomPanel(false);
                      setRoomName("");
                      setSearchQuery("");
                      setSelectedMembers([]);
                    }}
                    className="flex-1 rounded-lg bg-zinc-700 px-4 py-2 font-medium hover:bg-zinc-600 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (roomName.trim()) {
                        createRoom(roomName, selectedMembers);
                      }
                      setShowCreateRoomPanel(false);
                      setRoomName("");
                      setSearchQuery("");
                      setSelectedMembers([]);
                    }}
                    className="flex-1 rounded-lg bg-orange-600 px-4 py-2 font-medium hover:bg-orange-700 transition-colors"
                  >
                    Create
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Room List Sidebar */}
      <aside className="w-80 min-h-screen bg-zinc-900 border-l border-zinc-800 p-6 overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">Rooms</h2>
          <button
            onClick={() => setShowCreateRoomPanel(true)}
            className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-medium hover:bg-orange-700 transition-colors"
          >
            + New
          </button>
        </div>
        {isLoadingRooms ? (
          <p className="text-gray-400 text-sm">Loading rooms...</p>
        ) : rooms.length === 0 ? (
          <p className="text-gray-400 text-sm">
            No rooms yet. Create one to get started!
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Default Rooms Dropdown */}
            <div className="border border-zinc-700 rounded-lg overflow-hidden">
              <button
                onClick={() => setDefaultRoomsOpen(!defaultRoomsOpen)}
                className="w-full flex items-center justify-between px-4 py-3 bg-zinc-800 hover:bg-zinc-750 transition-colors"
              >
                <h3 className="font-semibold text-lg">Default Rooms</h3>
                <span className="text-gray-400">
                  {defaultRoomsOpen ? "▼" : "▶"}
                </span>
              </button>
              {defaultRoomsOpen && (
                <div className="flex flex-col gap-2 p-3 bg-zinc-900">
                  {rooms
                    .filter((room) => PERMANENT_ROOM_IDS.has(room.id))
                    .map((room) => (
                      <div
                        key={room.id}
                        className="bg-zinc-800 rounded-lg p-3 hover:bg-zinc-750 transition-colors"
                      >
                        <div
                          className="cursor-pointer flex items-center justify-between"
                          onClick={() => {
                            setSelectedRoom(room);
                            setShowEditMembers(true);
                          }}
                        >
                          <h3 className="font-semibold text-lg">{room.name}</h3>
                          <span className="text-sm text-gray-400">
                            {room.members.length === 0 ? "0" : room.members.length}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* Custom Rooms Dropdown */}
            <div className="border border-zinc-700 rounded-lg overflow-hidden">
              <button
                onClick={() => setCustomRoomsOpen(!customRoomsOpen)}
                className="w-full flex items-center justify-between px-4 py-3 bg-zinc-800 hover:bg-zinc-750 transition-colors"
              >
                <h3 className="font-semibold text-lg">Custom Rooms</h3>
                <span className="text-gray-400">
                  {customRoomsOpen ? "▼" : "▶"}
                </span>
              </button>
              {customRoomsOpen && (
                <div className="flex flex-col gap-2 p-3 bg-zinc-900">
                  {rooms
                    .filter((room) => !PERMANENT_ROOM_IDS.has(room.id))
                    .length === 0 ? (
                    <p className="text-gray-400 text-sm text-center py-2">
                      No custom rooms yet
                    </p>
                  ) : (
                    rooms
                      .filter((room) => !PERMANENT_ROOM_IDS.has(room.id))
                      .map((room) => (
                        <div
                          key={room.id}
                          className="bg-zinc-800 rounded-lg p-3 hover:bg-zinc-750 transition-colors"
                        >
                          <div
                            className="cursor-pointer flex items-center justify-between"
                            onClick={() => {
                              setSelectedRoom(room);
                              setShowEditMembers(true);
                            }}
                          >
                            <h3 className="font-semibold text-lg">{room.name}</h3>
                            <span className="text-sm text-gray-400">
                              {room.members.length === 0 ? "0" : room.members.length}
                            </span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteRoom(room.id);
                            }}
                            className="mt-3 w-full rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium hover:bg-red-700 transition-colors"
                          >
                            Delete Room
                          </button>
                        </div>
                      ))
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </aside>

      {/* Edit Members Modal */}
      {showEditMembers && selectedRoom && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-zinc-800 rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">{selectedRoom.name}</h2>
              <button
                onClick={() => {
                  setShowEditMembers(false);
                  setSelectedRoom(null);
                  setMemberSearchQuery("");
                }}
                className="text-gray-400 hover:text-white text-2xl"
              >
                &times;
              </button>
            </div>

            <div className="flex flex-col gap-4">
              {/* Show read-only notice for default rooms */}
              {PERMANENT_ROOM_IDS.has(selectedRoom.id) ? (
                <div className="bg-zinc-700 rounded-lg px-4 py-3 text-sm text-gray-300">
                  This is a default room. Members cannot be edited.
                </div>
              ) : (
                <div>
                  <label
                    htmlFor="memberSearch"
                    className="block text-sm font-medium mb-2"
                  >
                    Add Members
                  </label>
                  <input
                    id="memberSearch"
                    type="text"
                    value={memberSearchQuery}
                    onChange={(e) => setMemberSearchQuery(e.target.value)}
                    placeholder="Search for people..."
                    className="w-full px-4 py-2 rounded-lg bg-zinc-700 border border-zinc-600 focus:border-orange-500 focus:outline-none"
                  />

                  {/* Member Search Results */}
                  {memberSearchQuery.trim() !== "" && (
                    <div className="mt-2 max-h-40 overflow-y-auto bg-zinc-700 rounded-lg border border-zinc-600">
                      {memberSearchResults.length > 0 ? (
                        memberSearchResults
                          .filter(
                            (name) => !selectedRoom.members.includes(name)
                          )
                          .map((name, index) => (
                            <div
                              key={index}
                              onClick={() => {
                                if (selectedRoom) {
                                  addMemberToRoom(selectedRoom.id, name);
                                  setMemberSearchQuery("");
                                }
                              }}
                              className="px-4 py-2 hover:bg-zinc-600 cursor-pointer transition-colors border-b border-zinc-600 last:border-b-0"
                            >
                              {name}
                            </div>
                          ))
                      ) : (
                        <div className="px-4 py-2 text-gray-400 text-sm">
                          No matches found
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div>
                <h3 className="text-sm font-medium mb-2">
                  {PERMANENT_ROOM_IDS.has(selectedRoom.id) ? "Members" : "Current Members"}
                </h3>
                {selectedRoom.members.length === 0 ? (
                  <p className="text-sm text-gray-400">
                    No members in this room yet
                  </p>
                ) : (
                  <div className="flex flex-col gap-2 max-h-40 overflow-y-auto">
                    {selectedRoom.members.map((member, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between bg-zinc-700 rounded-lg px-3 py-2"
                      >
                        <span>{member}</span>
                        {!PERMANENT_ROOM_IDS.has(selectedRoom.id) && (
                          <button
                            onClick={() =>
                              removeMemberFromRoom(selectedRoom.id, member)
                            }
                            className="text-red-400 hover:text-red-300 text-sm"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={() => {
                  setShowEditMembers(false);
                  setSelectedRoom(null);
                  setMemberSearchQuery("");
                }}
                className="w-full rounded-lg bg-orange-600 px-4 py-2 font-medium hover:bg-orange-700 transition-colors mt-4"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
