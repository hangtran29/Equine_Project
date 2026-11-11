-- Yêu cầu hỗ trợ: bổ sung bảng cho database ĐÃ TẠO từ bản cũ. Database mới chỉ cần chạy horse_v2.sql.
-- Chạy được nhiều lần (bảng có rồi thì bỏ qua).
SET XACT_ABORT ON;
IF OBJECT_ID(N'dbo.SupportRequest', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.SupportRequest
    (
        SupportRequestID INT IDENTITY(1,1) NOT NULL,
        ClubID INT NOT NULL,
        RequesterID INT NOT NULL,
        Topic NVARCHAR(30) NOT NULL,
        HorseID INT NULL,
        Content NVARCHAR(1000) NOT NULL,
        Status NVARCHAR(20) NOT NULL CONSTRAINT DF_SupportRequest_Status DEFAULT N'Open',
        Response NVARCHAR(1000) NULL,
        ResolvedByID INT NULL,
        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_SupportRequest_CreatedAt DEFAULT SYSDATETIME(),
        ResolvedAt DATETIME2 NULL,

        CONSTRAINT PK_SupportRequest PRIMARY KEY (SupportRequestID),
        CONSTRAINT FK_SupportRequest_Club FOREIGN KEY (ClubID) REFERENCES dbo.Club(ClubID),
        CONSTRAINT FK_SupportRequest_Requester FOREIGN KEY (RequesterID) REFERENCES dbo.[User](UserID),
        CONSTRAINT FK_SupportRequest_Horse FOREIGN KEY (HorseID) REFERENCES dbo.Horse(HorseID),
        CONSTRAINT FK_SupportRequest_ResolvedBy FOREIGN KEY (ResolvedByID) REFERENCES dbo.[User](UserID),
        CONSTRAINT CK_SupportRequest_Topic CHECK (Topic IN (N'HorseProfile', N'Account', N'Training', N'Health', N'Care', N'Other')),
        CONSTRAINT CK_SupportRequest_Status CHECK (Status IN (N'Open', N'Resolved')),
        CONSTRAINT CK_SupportRequest_Resolved CHECK (
            (Status = N'Open' AND ResolvedAt IS NULL)
            OR (Status = N'Resolved' AND Response IS NOT NULL AND ResolvedByID IS NOT NULL AND ResolvedAt IS NOT NULL))
    );
    CREATE INDEX IX_SupportRequest_Club_Status ON dbo.SupportRequest(ClubID, Status, CreatedAt);
END;
