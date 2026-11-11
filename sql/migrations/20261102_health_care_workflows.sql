-- Equi Flow 3/4 additive SQL Server upgrade. Never recreates the database.
-- Review and apply explicitly in SSMS after backup; Django models are unmanaged.
-- Existing duplicate open reports require manual reconciliation; no rows are deleted.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF EXISTS (SELECT HorseID FROM dbo.HealthReport WHERE Status <> 'Resolved' GROUP BY HorseID HAVING COUNT(*) > 1)
    THROW 51130, 'Multiple open health reports exist. Reconcile them before applying this upgrade.', 1;
IF COL_LENGTH('dbo.MedicalRecord', 'FollowUpLockID') IS NULL
    ALTER TABLE dbo.MedicalRecord ADD FollowUpLockID INT NULL;
IF COL_LENGTH('dbo.CareTask', 'MedicalRecordID') IS NULL
    ALTER TABLE dbo.CareTask ADD MedicalRecordID INT NULL;
IF COL_LENGTH('dbo.CareTask', 'TrainingLockID') IS NULL
    ALTER TABLE dbo.CareTask ADD TrainingLockID INT NULL;
IF COL_LENGTH('dbo.CareTask', 'Priority') IS NULL
    ALTER TABLE dbo.CareTask ADD Priority VARCHAR(10) NOT NULL CONSTRAINT DF_CareTask_Priority DEFAULT 'Normal';
IF COL_LENGTH('dbo.CareTask', 'FeedingOutcome') IS NULL
    ALTER TABLE dbo.CareTask ADD FeedingOutcome VARCHAR(10) NULL;
IF COL_LENGTH('dbo.CareTask', 'OutcomeNote') IS NULL
    ALTER TABLE dbo.CareTask ADD OutcomeNote NVARCHAR(1000) NULL;
IF COL_LENGTH('dbo.CareTask', 'CompletedBy') IS NULL
    ALTER TABLE dbo.CareTask ADD CompletedBy INT NULL;
ALTER TABLE dbo.CareTask ALTER COLUMN GroomID INT NULL;
IF OBJECT_ID('dbo.CK_CareTask_Type', 'C') IS NOT NULL ALTER TABLE dbo.CareTask DROP CONSTRAINT CK_CareTask_Type;
ALTER TABLE dbo.CareTask ADD CONSTRAINT CK_CareTask_Type CHECK (TaskType IN ('Feeding','Cleaning','Bathing','Ice Leg Soak','Medical Care','Training Support'));
IF OBJECT_ID('dbo.CK_CareTaskRule_Type', 'C') IS NOT NULL ALTER TABLE dbo.CareTaskRule DROP CONSTRAINT CK_CareTaskRule_Type;
ALTER TABLE dbo.CareTaskRule ADD CONSTRAINT CK_CareTaskRule_Type CHECK (TaskType IN ('Feeding','Cleaning','Bathing','Ice Leg Soak','Medical Care','Training Support'));
IF OBJECT_ID('dbo.WorkflowNotice', 'U') IS NULL
BEGIN
CREATE TABLE dbo.WorkflowNotice
(
    WorkflowNoticeID INT IDENTITY(1,1) PRIMARY KEY,
    UserID INT NOT NULL,
    HorseID INT NOT NULL,
    Kind NVARCHAR(50) NOT NULL,
    SourceKey NVARCHAR(160) NOT NULL,
    Message NVARCHAR(1000) NOT NULL,
    CreatedAt DATETIME2 NOT NULL,
    CONSTRAINT FK_WorkflowNotice_UserID FOREIGN KEY (UserID) REFERENCES dbo.[User](UserID),
    CONSTRAINT FK_WorkflowNotice_HorseID FOREIGN KEY (HorseID) REFERENCES dbo.[Horse](HorseID),
    CONSTRAINT UQ_WorkflowNotice_User_Source UNIQUE (UserID, SourceKey)
);
END;
IF OBJECT_ID('dbo.HealthReportAttachment', 'U') IS NULL
BEGIN
CREATE TABLE dbo.HealthReportAttachment
(
    HealthReportAttachmentID INT IDENTITY(1,1) PRIMARY KEY,
    HorseID INT NOT NULL,
    HealthReportID INT NULL,
    UploadedBy INT NOT NULL,
    FileUrl NVARCHAR(500) NOT NULL,
    UploadedAt DATETIME2 NOT NULL,
    CONSTRAINT FK_HealthReportAttachment_HorseID FOREIGN KEY (HorseID) REFERENCES dbo.[Horse](HorseID),
    CONSTRAINT FK_HealthReportAttachment_HealthReportID FOREIGN KEY (HealthReportID) REFERENCES dbo.[HealthReport](HealthReportID),
    CONSTRAINT FK_HealthReportAttachment_UploadedBy FOREIGN KEY (UploadedBy) REFERENCES dbo.[User](UserID)
);
END;
IF OBJECT_ID('dbo.InjuryMarker', 'U') IS NULL
BEGIN
CREATE TABLE dbo.InjuryMarker
(
    InjuryMarkerID INT IDENTITY(1,1) PRIMARY KEY,
    MedicalRecordID INT NOT NULL,
    BodyRegion NVARCHAR(30) NOT NULL,
    BodySide NVARCHAR(5) NOT NULL,
    DiagramView NVARCHAR(5) NOT NULL,
    XRatio DECIMAL(12,10) NOT NULL,
    YRatio DECIMAL(12,10) NOT NULL,
    DiagramVersion NVARCHAR(50) NOT NULL,
    Description NVARCHAR(1500) NOT NULL,
    Severity NVARCHAR(20) NOT NULL,
    Status NVARCHAR(20) NOT NULL,
    DetectedAt DATE NOT NULL,
    Notes NVARCHAR(2000) NOT NULL,
    CONSTRAINT FK_InjuryMarker_MedicalRecordID FOREIGN KEY (MedicalRecordID) REFERENCES dbo.[MedicalRecord](MedicalRecordID),
    CONSTRAINT CK_InjuryMarker_Ratio CHECK (XRatio BETWEEN 0 AND 1 AND YRatio BETWEEN 0 AND 1),
    CONSTRAINT CK_InjuryMarker_Side CHECK (BodySide IN ('left','right') AND DiagramView = BodySide)
);
END;
IF OBJECT_ID('dbo.InjuryAssessment', 'U') IS NULL
BEGIN
CREATE TABLE dbo.InjuryAssessment
(
    InjuryAssessmentID INT IDENTITY(1,1) PRIMARY KEY,
    InjuryMarkerID INT NOT NULL,
    MedicalRecordID INT NOT NULL,
    AssessmentDate DATE NOT NULL,
    Status NVARCHAR(20) NOT NULL,
    Comment NVARCHAR(1500) NOT NULL,
    AuthorID INT NOT NULL,
    CreatedAt DATETIME2 NOT NULL,
    CONSTRAINT FK_InjuryAssessment_InjuryMarkerID FOREIGN KEY (InjuryMarkerID) REFERENCES dbo.[InjuryMarker](InjuryMarkerID),
    CONSTRAINT FK_InjuryAssessment_MedicalRecordID FOREIGN KEY (MedicalRecordID) REFERENCES dbo.[MedicalRecord](MedicalRecordID),
    CONSTRAINT FK_InjuryAssessment_AuthorID FOREIGN KEY (AuthorID) REFERENCES dbo.[User](UserID)
);
END;
IF OBJECT_ID('dbo.VetCareOrder', 'U') IS NULL
BEGIN
CREATE TABLE dbo.VetCareOrder
(
    VetCareOrderID INT IDENTITY(1,1) PRIMARY KEY,
    MedicalRecordID INT NOT NULL,
    TrainingLockID INT NULL,
    CreatedBy INT NOT NULL,
    TaskType NVARCHAR(50) NOT NULL,
    Instructions NVARCHAR(1000) NOT NULL,
    StartDate DATE NOT NULL,
    EndDate DATE NOT NULL,
    TimeOfDay TIME NOT NULL,
    IsActive BIT NOT NULL,
    CreatedAt DATETIME2 NOT NULL,
    CONSTRAINT FK_VetCareOrder_MedicalRecordID FOREIGN KEY (MedicalRecordID) REFERENCES dbo.[MedicalRecord](MedicalRecordID),
    CONSTRAINT FK_VetCareOrder_TrainingLockID FOREIGN KEY (TrainingLockID) REFERENCES dbo.[TrainingLock](TrainingLockID),
    CONSTRAINT FK_VetCareOrder_CreatedBy FOREIGN KEY (CreatedBy) REFERENCES dbo.[User](UserID),
    CONSTRAINT CK_VetCareOrder_TaskType CHECK (TaskType IN ('Feeding', 'Cleaning', 'Bathing', 'Ice Leg Soak', 'Medical Care', 'Training Support'))
);
END;
IF OBJECT_ID('dbo.VetDietRestriction', 'U') IS NULL
BEGIN
CREATE TABLE dbo.VetDietRestriction
(
    VetDietRestrictionID INT IDENTITY(1,1) PRIMARY KEY,
    HorseID INT NOT NULL,
    CreatedBy INT NOT NULL,
    Instructions NVARCHAR(1500) NOT NULL,
    FeedType NVARCHAR(100) NOT NULL,
    MaxDailyQuantity DECIMAL(10,2) NULL,
    Unit NVARCHAR(30) NOT NULL,
    StartDate DATE NOT NULL,
    EndDate DATE NULL,
    CreatedAt DATETIME2 NOT NULL,
    IsActive BIT NOT NULL,
    CONSTRAINT FK_VetDietRestriction_HorseID FOREIGN KEY (HorseID) REFERENCES dbo.[Horse](HorseID),
    CONSTRAINT FK_VetDietRestriction_CreatedBy FOREIGN KEY (CreatedBy) REFERENCES dbo.[User](UserID)
);
END;
IF OBJECT_ID('dbo.FK_MedicalRecord_FollowUpLock', 'F') IS NULL
    ALTER TABLE dbo.MedicalRecord ADD CONSTRAINT FK_MedicalRecord_FollowUpLock FOREIGN KEY (FollowUpLockID) REFERENCES dbo.TrainingLock(TrainingLockID);
IF OBJECT_ID('dbo.FK_CareTask_MedicalRecord', 'F') IS NULL
    ALTER TABLE dbo.CareTask ADD CONSTRAINT FK_CareTask_MedicalRecord FOREIGN KEY (MedicalRecordID) REFERENCES dbo.MedicalRecord(MedicalRecordID);
IF OBJECT_ID('dbo.FK_CareTask_TrainingLock', 'F') IS NULL
    ALTER TABLE dbo.CareTask ADD CONSTRAINT FK_CareTask_TrainingLock FOREIGN KEY (TrainingLockID) REFERENCES dbo.TrainingLock(TrainingLockID);
IF OBJECT_ID('dbo.FK_CareTask_CompletedBy', 'F') IS NULL
    ALTER TABLE dbo.CareTask ADD CONSTRAINT FK_CareTask_CompletedBy FOREIGN KEY (CompletedBy) REFERENCES dbo.[User](UserID);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='UX_HealthReport_OneOpen' AND object_id=OBJECT_ID('dbo.HealthReport'))
    CREATE UNIQUE INDEX UX_HealthReport_OneOpen ON dbo.HealthReport(HorseID) WHERE Status <> 'Resolved';
IF COL_LENGTH('dbo.CareTask', 'DietMealID') IS NULL ALTER TABLE dbo.CareTask ADD DietMealID INT NULL;
IF OBJECT_ID('dbo.FK_CareTask_DietMeal', 'F') IS NULL ALTER TABLE dbo.CareTask ADD CONSTRAINT FK_CareTask_DietMeal FOREIGN KEY (DietMealID) REFERENCES dbo.DietMeal(DietMealID);
COMMIT TRANSACTION;
