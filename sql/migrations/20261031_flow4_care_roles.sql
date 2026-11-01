-- Flow 4 - phân vai chăm sóc: Vet / Trainer giao việc phát sinh, Groom ghi ngựa ăn hết / bỏ ăn, Vet xin vật tư.
-- Cho database ĐÃ CÓ dữ liệu (database mới chỉ cần chạy horse_v2.sql). Chạy lại nhiều lần không sao.

IF COL_LENGTH('dbo.CareTask', 'IntakeStatus') IS NULL
    ALTER TABLE dbo.CareTask ADD IntakeStatus VARCHAR(20) NULL;
GO

-- Loại việc mới: Medical Care (Vet giao), Training Care (Trainer giao)
IF OBJECT_ID('dbo.CK_CareTask_Type', 'C') IS NOT NULL
    ALTER TABLE dbo.CareTask DROP CONSTRAINT CK_CareTask_Type;
GO
ALTER TABLE dbo.CareTask ADD CONSTRAINT CK_CareTask_Type CHECK
(
    TaskType IN ('Feeding', 'Cleaning', 'Bathing', 'Ice Leg Soak', 'Medical Care', 'Training Care')
);
GO

IF OBJECT_ID('dbo.CK_CareTask_Intake', 'C') IS NULL
    ALTER TABLE dbo.CareTask ADD CONSTRAINT CK_CareTask_Intake CHECK
    (
        IntakeStatus IS NULL OR (TaskType = 'Feeding' AND IntakeStatus IN ('Full', 'Partial', 'Refused'))
    );
GO

-- Bác sĩ thú y gửi phiếu xin vật tư (thuốc, băng gạc) và xem tồn kho
INSERT INTO dbo.RolePermission (RoleID, PermissionID)
SELECT r.RoleID, p.PermissionID
FROM dbo.Role r
JOIN dbo.Permission p ON p.PermissionCode = 'INVENTORY_REQUEST'
WHERE r.RoleCode = 'VETERINARIAN'
  AND NOT EXISTS (SELECT 1 FROM dbo.RolePermission rp WHERE rp.RoleID = r.RoleID AND rp.PermissionID = p.PermissionID);
GO
