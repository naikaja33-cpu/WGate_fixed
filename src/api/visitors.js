const API_BASE_URL = "http://localhost:3001/api";

export async function getVisitors() {
  const response = await fetch(`${API_BASE_URL}/visitors`);

  if (!response.ok) {
    throw new Error("Failed to fetch visitors");
  }

  return response.json();
}

export async function getVisitor(id) {
  const response = await fetch(`${API_BASE_URL}/visitors/${id}`);

  if (!response.ok) {
    throw new Error("Failed to fetch visitor");
  }

  return response.json();
}

export async function createVisitor(visitor) {
  const response = await fetch(`${API_BASE_URL}/visitors`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(visitor)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));

    throw new Error(
      error.message || "Failed to create visitor"
    );
  }

  return response.json();
}

export async function updateVisitor(id, visitor) {
  const response = await fetch(
    `${API_BASE_URL}/visitors/${id}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(visitor)
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));

    throw new Error(
      error.message || "Failed to update visitor"
    );
  }

  return response.json();
}

export async function deleteVisitor(id) {
  const response = await fetch(
    `${API_BASE_URL}/visitors/${id}`,
    {
      method: "DELETE"
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));

    throw new Error(
      error.message || "Failed to delete visitor"
    );
  }

  return response.json();
}