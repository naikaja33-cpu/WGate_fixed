const express = require("express");

const crypto = require("crypto");
function createVisitorRouter(db) {
  const router = express.Router();

  // GET /api/visitors
  // Get all visitors
  router.get("/", (req, res) => {
    try {
      const visitors = db
        .prepare(`
          SELECT *
          FROM visitor
          ORDER BY created_date DESC
        `)
        .all();

      res.json({
        success: true,
        data: visitors
      });
    } catch (error) {
      console.error("GET VISITORS ERROR:", error);

      res.status(500).json({
        success: false,
        message: "Failed to fetch visitors",
        error: error.message
      });
    }
  });

  // GET /api/visitors/:id
  // Get visitor by ID
  router.get("/:id", (req, res) => {
    try {
      const visitor = db
        .prepare(`
          SELECT *
          FROM visitor
          WHERE id = ?
        `)
        .get(req.params.id);

      if (!visitor) {
        return res.status(404).json({
          success: false,
          message: "Visitor not found"
        });
      }

      res.json({
        success: true,
        data: visitor
      });
    } catch (error) {
      console.error("GET VISITOR ERROR:", error);

      res.status(500).json({
        success: false,
        message: "Failed to fetch visitor",
        error: error.message
      });
    }
  });

  // POST /api/visitors
  // Create visitor
  router.post("/", (req, res) => {
    try {
      const {
        visitor_name,
        visitor_phone,
        purpose,
        flat_number,
        resident_email,
        status,
        vehicle_number,
        photo_url,
        notes
      } = req.body;

      if (!visitor_name) {
        return res.status(400).json({
          success: false,
          message: "visitor_name is required"
        });
      }

      const now = new Date().toISOString();

      const id = crypto.randomUUID();

      db.prepare(`
        INSERT INTO visitor (
          id,
          created_date,
          updated_date,
          created_by,
          created_by_id,
          is_sample,
          visitor_name,
          visitor_phone,
          purpose,
          flat_number,
          resident_email,
          status,
          vehicle_number,
          photo_url,
          check_in_time,
          check_out_time,
          notes
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        now,
        now,
        null,
        null,
        0,
        visitor_name,
        visitor_phone || null,
        purpose || null,
        flat_number || null,
        resident_email || null,
        status || "pending",
        vehicle_number || null,
        photo_url || null,
        null,
        null,
        notes || null
      );

      const visitor = db
        .prepare(`
          SELECT *
          FROM visitor
          WHERE id = ?
        `)
        .get(id);

      res.status(201).json({
        success: true,
        message: "Visitor created successfully",
        data: visitor
      });
    } catch (error) {
      console.error("CREATE VISITOR ERROR:", error);

      res.status(500).json({
        success: false,
        message: "Failed to create visitor",
        error: error.message
      });
    }
  });

  // PUT /api/visitors/:id
  // Update visitor
  router.put("/:id", (req, res) => {
    try {
      const existingVisitor = db
        .prepare(`
          SELECT *
          FROM visitor
          WHERE id = ?
        `)
        .get(req.params.id);

      if (!existingVisitor) {
        return res.status(404).json({
          success: false,
          message: "Visitor not found"
        });
      }

      const {
        visitor_name,
        visitor_phone,
        purpose,
        flat_number,
        resident_email,
        status,
        vehicle_number,
        photo_url,
        check_in_time,
        check_out_time,
        notes
      } = req.body;

      const now = new Date().toISOString();

      db.prepare(`
        UPDATE visitor
        SET
          updated_date = ?,
          visitor_name = ?,
          visitor_phone = ?,
          purpose = ?,
          flat_number = ?,
          resident_email = ?,
          status = ?,
          vehicle_number = ?,
          photo_url = ?,
          check_in_time = ?,
          check_out_time = ?,
          notes = ?
        WHERE id = ?
      `).run(
        now,
        visitor_name ?? existingVisitor.visitor_name,
        visitor_phone ?? existingVisitor.visitor_phone,
        purpose ?? existingVisitor.purpose,
        flat_number ?? existingVisitor.flat_number,
        resident_email ?? existingVisitor.resident_email,
        status ?? existingVisitor.status,
        vehicle_number ?? existingVisitor.vehicle_number,
        photo_url ?? existingVisitor.photo_url,
        check_in_time ?? existingVisitor.check_in_time,
        check_out_time ?? existingVisitor.check_out_time,
        notes ?? existingVisitor.notes,
        req.params.id
      );

      const visitor = db
        .prepare(`
          SELECT *
          FROM visitor
          WHERE id = ?
        `)
        .get(req.params.id);

      res.json({
        success: true,
        message: "Visitor updated successfully",
        data: visitor
      });
    } catch (error) {
      console.error("UPDATE VISITOR ERROR:", error);

      res.status(500).json({
        success: false,
        message: "Failed to update visitor",
        error: error.message
      });
    }
  });

  // DELETE /api/visitors/:id
  // Delete visitor
  router.delete("/:id", (req, res) => {
    try {
      const result = db
        .prepare(`
          DELETE FROM visitor
          WHERE id = ?
        `)
        .run(req.params.id);

      if (result.changes === 0) {
        return res.status(404).json({
          success: false,
          message: "Visitor not found"
        });
      }

      res.json({
        success: true,
        message: "Visitor deleted successfully"
      });
    } catch (error) {
      console.error("DELETE VISITOR ERROR:", error);

      res.status(500).json({
        success: false,
        message: "Failed to delete visitor",
        error: error.message
      });
    }
  });

  return router;
}

module.exports = createVisitorRouter;