// Community Editor Service - Allow admins/local guides to update airport information

import { Firestore, collection, doc, setDoc, getDoc, updateDoc, query, where, getDocs, Timestamp } from 'firebase/firestore';

export interface CommunityEdit {
  id: string;
  type: 'walking-time' | 'route' | 'facility' | 'gate' | 'elevator' | 'escalator' | 'accessibility' | 'other';
  airportCode: string;
  location: {
    from?: { type: string; id: string; coordinates?: { lat: number; lng: number } };
    to?: { type: string; id: string; coordinates?: { lat: number; lng: number } };
    coordinates?: { lat: number; lng: number };
  };
  data: {
    walkingTime?: number;
    distance?: number;
    route?: string[];
    instructions?: string[];
    accessibility?: {
      wheelchairAccessible: boolean;
      elevatorAvailable: boolean;
      escalatorAvailable: boolean;
      assistanceAvailable: boolean;
    };
    description?: string;
  };
  editedBy: {
    userId: string;
    name: string;
    role: 'admin' | 'local-guide' | 'verified-user' | 'user';
  };
  status: 'pending' | 'approved' | 'rejected';
  verifiedBy?: {
    userId: string;
    name: string;
    verifiedAt: string;
  };
  createdAt: string;
  updatedAt: string;
}

export class CommunityEditor {
  private db: Firestore;

  constructor(db: Firestore) {
    this.db = db;
  }

  // Submit an edit
  async submitEdit(edit: Omit<CommunityEdit, 'id' | 'status' | 'createdAt' | 'updatedAt'>): Promise<CommunityEdit> {
    const editDoc: CommunityEdit = {
      ...edit,
      id: Math.random().toString(36),
      status: edit.editedBy.role === 'admin' ? 'approved' : 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await setDoc(doc(this.db, 'airport-edits', editDoc.id), {
      ...editDoc,
      createdAt: Timestamp.fromDate(new Date(editDoc.createdAt)),
      updatedAt: Timestamp.fromDate(new Date(editDoc.updatedAt))
    });

    return editDoc;
  }

  // Get pending edits (for admins)
  async getPendingEdits(airportCode?: string): Promise<CommunityEdit[]> {
    const q = airportCode
      ? query(collection(this.db, 'airport-edits'), where('status', '==', 'pending'), where('airportCode', '==', airportCode))
      : query(collection(this.db, 'airport-edits'), where('status', '==', 'pending'));

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      ...doc.data(),
      id: doc.id,
      createdAt: doc.data().createdAt.toDate().toISOString(),
      updatedAt: doc.data().updatedAt.toDate().toISOString()
    } as CommunityEdit));
  }

  // Approve an edit
  async approveEdit(editId: string, verifiedBy: { userId: string; name: string }): Promise<boolean> {
    try {
      await updateDoc(doc(this.db, 'airport-edits', editId), {
        status: 'approved',
        verifiedBy: {
          ...verifiedBy,
          verifiedAt: new Date().toISOString()
        },
        updatedAt: Timestamp.now()
      });

      // Apply edit to airport data
      const editDoc = await getDoc(doc(this.db, 'airport-edits', editId));
      if (editDoc.exists()) {
        await this.applyEdit(editDoc.data() as CommunityEdit);
      }

      return true;
    } catch (error) {
      console.error('Error approving edit:', error);
      return false;
    }
  }

  // Reject an edit
  async rejectEdit(editId: string, reason: string): Promise<boolean> {
    try {
      await updateDoc(doc(this.db, 'airport-edits', editId), {
        status: 'rejected',
        rejectionReason: reason,
        updatedAt: Timestamp.now()
      });
      return true;
    } catch (error) {
      console.error('Error rejecting edit:', error);
      return false;
    }
  }

  // Apply approved edit to airport data
  private async applyEdit(edit: CommunityEdit): Promise<void> {
    const airportRef = doc(this.db, 'airports', edit.airportCode);
    const airportDoc = await getDoc(airportRef);

    if (!airportDoc.exists()) {
      // Create airport document if it doesn't exist
      await setDoc(airportRef, {
        code: edit.airportCode,
        communityEdits: [edit]
      });
    } else {
      // Update airport document with edit
      const airportData = airportDoc.data();
      const edits = airportData.communityEdits || [];
      edits.push(edit);

      await updateDoc(airportRef, {
        communityEdits: edits,
        lastUpdated: Timestamp.now()
      });
    }
  }

  // Get community edits for an airport
  async getAirportEdits(airportCode: string): Promise<CommunityEdit[]> {
    const q = query(
      collection(this.db, 'airport-edits'),
      where('airportCode', '==', airportCode),
      where('status', '==', 'approved')
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      ...doc.data(),
      id: doc.id,
      createdAt: doc.data().createdAt.toDate().toISOString(),
      updatedAt: doc.data().updatedAt.toDate().toISOString()
    } as CommunityEdit));
  }

  // Vote on an edit (for community verification)
  async voteOnEdit(editId: string, userId: string, vote: 'up' | 'down'): Promise<boolean> {
    try {
      const editRef = doc(this.db, 'airport-edits', editId);
      const editDoc = await getDoc(editRef);

      if (!editDoc.exists()) {
        return false;
      }

      const editData = editDoc.data();
      const votes = editData.votes || {};
      votes[userId] = vote;

      await updateDoc(editRef, {
        votes,
        voteCount: Object.keys(votes).length,
        updatedAt: Timestamp.now()
      });

      return true;
    } catch (error) {
      console.error('Error voting on edit:', error);
      return false;
    }
  }

  // Get edit statistics
  async getEditStats(airportCode?: string): Promise<{
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    byType: Record<string, number>;
  }> {
    const q = airportCode
      ? query(collection(this.db, 'airport-edits'), where('airportCode', '==', airportCode))
      : query(collection(this.db, 'airport-edits'));

    const snapshot = await getDocs(q);
    const edits = snapshot.docs.map(doc => doc.data() as CommunityEdit);

    return {
      total: edits.length,
      pending: edits.filter(e => e.status === 'pending').length,
      approved: edits.filter(e => e.status === 'approved').length,
      rejected: edits.filter(e => e.status === 'rejected').length,
      byType: edits.reduce((acc, edit) => {
        acc[edit.type] = (acc[edit.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    };
  }
}

