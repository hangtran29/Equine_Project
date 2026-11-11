/* EquiTrack integration upgrade, 2026-11-08.
   For an existing TARGET database after 20261102_health_care_workflows.sql.
   No seed or sample media. No DROP/DELETE/UPDATE of business records.
   Run the preflight script first. Rerunnable; duplicate data aborts before DDL.
   The equivalent SOURCE 20261105/20261106 scripts are included below as guarded DDL.
*/
SET XACT_ABORT ON;
SET NOCOUNT ON;
BEGIN TRY
    BEGIN TRANSACTION;
    IF OBJECT_ID(N'dbo.WorkflowNotice', N'U') IS NULL
       OR OBJECT_ID(N'dbo.InjuryMarker', N'U') IS NULL
       OR COL_LENGTH('dbo.MedicalRecord', 'FollowUpLockID') IS NULL
        THROW 51100, 'Apply 20261102_health_care_workflows.sql before this upgrade.', 1;
    IF EXISTS (SELECT PassportNumber FROM dbo.Horse WHERE PassportNumber IS NOT NULL GROUP BY PassportNumber HAVING COUNT(*) > 1)
        THROW 51101, 'Duplicate passport numbers. Run 20261108_equitrack_preflight.sql; resolve manually.', 1;
    IF EXISTS (SELECT Phone FROM dbo.[User] WHERE Phone IS NOT NULL GROUP BY Phone HAVING COUNT(*) > 1)
        THROW 51102, 'Duplicate phone numbers. Run 20261108_equitrack_preflight.sql; resolve manually.', 1;
    EXEC sys.sp_executesql N'-- Flow 1 (thiết kế mới): bổ sung cột cho database ĐÃ TẠO từ bản cũ. Database mới chỉ cần chạy horse_v2.sql.
-- Chạy được nhiều lần (cột nào có rồi thì bỏ qua). Không xóa / sửa dữ liệu cũ.



-- Tài khoản do Manager tạo / cấp lại mật khẩu tạm: phải đổi mật khẩu ở lần đăng nhập đầu
IF COL_LENGTH(''dbo.[User]'', ''MustChangePassword'') IS NULL
    ALTER TABLE dbo.[User] ADD MustChangePassword BIT NOT NULL
        CONSTRAINT DF_User_MustChangePassword DEFAULT 0;

-- Hồ sơ ngựa: ngày rời CLB + 3 ô sức khỏe chủ ngựa tự khai
IF COL_LENGTH(''dbo.Horse'', ''LeftDate'') IS NULL
    ALTER TABLE dbo.Horse ADD LeftDate DATE NULL;
IF COL_LENGTH(''dbo.Horse'', ''DeclaredHealth'') IS NULL
    ALTER TABLE dbo.Horse ADD DeclaredHealth NVARCHAR(1000) NULL;
IF COL_LENGTH(''dbo.Horse'', ''MedicalHistory'') IS NULL
    ALTER TABLE dbo.Horse ADD MedicalHistory NVARCHAR(1000) NULL;
IF COL_LENGTH(''dbo.Horse'', ''OwnerNote'') IS NULL
    ALTER TABLE dbo.Horse ADD OwnerNote NVARCHAR(1000) NULL;

-- Chuồng: ngày dự kiến xong bảo trì
IF COL_LENGTH(''dbo.Stall'', ''MaintenanceUntil'') IS NULL
    ALTER TABLE dbo.Stall ADD MaintenanceUntil DATE NULL;

-- Phiếu khám: chỉ số sinh hiệu
IF COL_LENGTH(''dbo.MedicalRecord'', ''BodyTemperatureC'') IS NULL
    ALTER TABLE dbo.MedicalRecord ADD BodyTemperatureC DECIMAL(4,1) NULL;
IF COL_LENGTH(''dbo.MedicalRecord'', ''HeartRateBpm'') IS NULL
    ALTER TABLE dbo.MedicalRecord ADD HeartRateBpm INT NULL;
IF COL_LENGTH(''dbo.MedicalRecord'', ''RespiratoryRate'') IS NULL
    ALTER TABLE dbo.MedicalRecord ADD RespiratoryRate INT NULL;


';

    EXEC sys.sp_executesql N'/*
  Sửa lỗi mất dấu tiếng Việt (vd "Cát, đường đất" bị lưu thành "Cát, du?ng d?t").
  Các cột dưới đây do người dùng tự gõ nhưng đang là VARCHAR, SQL Server đổi ký tự ngoài bảng mã Latin thành dấu ?.
  Đổi sang NVARCHAR (Unicode). Script chạy lại nhiều lần vẫn an toàn.
  Lưu ý: dữ liệu ĐÃ bị đổi thành "?" trước đó không khôi phục được, cần nhập lại.
*/



IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(''dbo.Stall'') AND name = ''StallType'' AND system_type_id = TYPE_ID(''varchar''))
    ALTER TABLE dbo.Stall ALTER COLUMN StallType NVARCHAR(50) NULL;

IF OBJECT_ID(''dbo.TrainingPlanTemplateStage'') IS NOT NULL
   AND EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(''dbo.TrainingPlanTemplateStage'') AND name = ''Surface'' AND system_type_id = TYPE_ID(''varchar''))
    ALTER TABLE dbo.TrainingPlanTemplateStage ALTER COLUMN Surface NVARCHAR(50) NULL;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(''dbo.TrainingPlanStage'') AND name = ''Surface'' AND system_type_id = TYPE_ID(''varchar''))
    ALTER TABLE dbo.TrainingPlanStage ALTER COLUMN Surface NVARCHAR(50) NULL;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(''dbo.TrainingSession'') AND name = ''TrainingType'' AND system_type_id = TYPE_ID(''varchar''))
    ALTER TABLE dbo.TrainingSession ALTER COLUMN TrainingType NVARCHAR(60) NOT NULL;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(''dbo.TrainingSession'') AND name = ''Surface'' AND system_type_id = TYPE_ID(''varchar''))
    ALTER TABLE dbo.TrainingSession ALTER COLUMN Surface NVARCHAR(50) NULL;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(''dbo.DietMeal'') AND name = ''Unit'' AND system_type_id = TYPE_ID(''varchar''))
    ALTER TABLE dbo.DietMeal ALTER COLUMN Unit NVARCHAR(30) NOT NULL;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(''dbo.InventoryItem'') AND name = ''Unit'' AND system_type_id = TYPE_ID(''varchar''))
    ALTER TABLE dbo.InventoryItem ALTER COLUMN Unit NVARCHAR(30) NOT NULL;


';

    EXEC sys.sp_executesql N'-- Yêu cầu hỗ trợ: bổ sung bảng cho database ĐÃ TẠO từ bản cũ. Database mới chỉ cần chạy horse_v2.sql.
-- Chạy được nhiều lần (bảng có rồi thì bỏ qua).

IF OBJECT_ID(N''dbo.SupportRequest'', N''U'') IS NULL
BEGIN
    CREATE TABLE dbo.SupportRequest
    (
        SupportRequestID INT IDENTITY(1,1) NOT NULL,
        ClubID INT NOT NULL,
        RequesterID INT NOT NULL,
        Topic NVARCHAR(30) NOT NULL,
        HorseID INT NULL,
        Content NVARCHAR(1000) NOT NULL,
        Status NVARCHAR(20) NOT NULL CONSTRAINT DF_SupportRequest_Status DEFAULT N''Open'',
        Response NVARCHAR(1000) NULL,
        ResolvedByID INT NULL,
        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_SupportRequest_CreatedAt DEFAULT SYSDATETIME(),
        ResolvedAt DATETIME2 NULL,

        CONSTRAINT PK_SupportRequest PRIMARY KEY (SupportRequestID),
        CONSTRAINT FK_SupportRequest_Club FOREIGN KEY (ClubID) REFERENCES dbo.Club(ClubID),
        CONSTRAINT FK_SupportRequest_Requester FOREIGN KEY (RequesterID) REFERENCES dbo.[User](UserID),
        CONSTRAINT FK_SupportRequest_Horse FOREIGN KEY (HorseID) REFERENCES dbo.Horse(HorseID),
        CONSTRAINT FK_SupportRequest_ResolvedBy FOREIGN KEY (ResolvedByID) REFERENCES dbo.[User](UserID),
        CONSTRAINT CK_SupportRequest_Topic CHECK (Topic IN (N''HorseProfile'', N''Account'', N''Training'', N''Health'', N''Care'', N''Other'')),
        CONSTRAINT CK_SupportRequest_Status CHECK (Status IN (N''Open'', N''Resolved'')),
        CONSTRAINT CK_SupportRequest_Resolved CHECK (
            (Status = N''Open'' AND ResolvedAt IS NULL)
            OR (Status = N''Resolved'' AND Response IS NOT NULL AND ResolvedByID IS NOT NULL AND ResolvedAt IS NOT NULL))
    );
    CREATE INDEX IX_SupportRequest_Club_Status ON dbo.SupportRequest(ClubID, Status, CreatedAt);
END;
';

    EXEC sys.sp_executesql N'-- Kết thúc buổi tập sớm hơn dự kiến: lưu lý do (KS03b). Chạy được nhiều lần.

IF COL_LENGTH(''dbo.TrainingResult'', ''EarlyEndReason'') IS NULL
    ALTER TABLE dbo.TrainingResult ADD EarlyEndReason NVARCHAR(30) NULL;
IF COL_LENGTH(''dbo.TrainingResult'', ''EarlyEndNote'') IS NULL
    ALTER TABLE dbo.TrainingResult ADD EarlyEndNote NVARCHAR(1000) NULL;
';

    EXEC sys.sp_executesql N'
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = ''CK_TrainingResult_EarlyEnd'')
    ALTER TABLE dbo.TrainingResult ADD CONSTRAINT CK_TrainingResult_EarlyEnd CHECK
    (
        EarlyEndReason IS NULL
        OR (EarlyEndReason IN (N''Fatigue'', N''Injury'', N''Weather'', N''Surface'', N''Rider'', N''Other'') AND EarlyEndNote IS NOT NULL)
    );
';

    EXEC sys.sp_executesql N'-- Số hộ chiếu (UELN) và số điện thoại không được trùng. Chạy được nhiều lần.
-- Nếu database cũ đang có dữ liệu trùng, lệnh tạo chỉ mục sẽ báo lỗi: hãy sửa các dòng trùng trước.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = ''UX_Horse_PassportNumber'' AND object_id = OBJECT_ID(''dbo.Horse''))
    CREATE UNIQUE INDEX UX_Horse_PassportNumber ON dbo.Horse(PassportNumber) WHERE PassportNumber IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = ''UX_User_Phone'' AND object_id = OBJECT_ID(''dbo.[User]''))
    CREATE UNIQUE INDEX UX_User_Phone ON dbo.[User](Phone) WHERE Phone IS NOT NULL;
';
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SupportRequest_Club_Status' AND object_id = OBJECT_ID('dbo.SupportRequest'))
        CREATE INDEX IX_SupportRequest_Club_Status ON dbo.SupportRequest(ClubID, Status, CreatedAt);
    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
